import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { currentUser } from '@/lib/session';
import { throttle } from '@/lib/auth-service';
import { reserveWorkspaceCredits, finishWorkspaceCredits } from '@/lib/credits';
import { maybeAttemptWorkspaceAutoReload } from '@/lib/workspace-auto-reload';
import { generateResponse, type AIImage } from '@/lib/ai';
import { query, transaction } from '@/lib/db';

export const runtime = 'nodejs';
export const maxDuration = 60;

function reply(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status });
}

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return reply({ error: 'Please sign in to use Workspace.' }, 401);

  let reservation: string | undefined;
  try {
    await throttle(`workspace:${user.id}`, 60);
    const body = await request.json();
    const conversationId =
      typeof body?.conversationId === 'string' && body.conversationId
        ? body.conversationId
        : randomUUID();
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    const images = Array.isArray(body?.images) ? (body.images as AIImage[]) : [];
    const lastUser = [...messages].reverse().find((message) => message?.sender === 'user');
    const prompt = typeof lastUser?.content === 'string' ? lastUser.content.trim() : '';

    if (!prompt && images.length === 0) {
      return reply({ error: 'Enter a task or attach an image.' }, 400);
    }

    const existing = await query<{ user_id: string; area: string }>(
      'select user_id,area from chats where id=$1',
      [conversationId],
    );
    if (existing.length && (existing[0].user_id !== user.id || existing[0].area !== 'workspace')) {
      return reply({ error: 'Conversation unavailable.' }, 403);
    }

    reservation = await reserveWorkspaceCredits(user.id);
    const answer = await generateResponse(
      messages
        .filter((message: { sender?: string; content?: string }) => message?.sender && message?.content)
        .map((message: { sender: 'user' | 'ai'; content: string }) => ({
          sender: message.sender,
          content: String(message.content).slice(0, 3200),
        })),
      null,
      images,
    );

    const userMessageId = randomUUID();
    const answerId = randomUUID();
    const nextBalance = await transaction(async (client) => {
      const current = await client.query<{ user_id: string; area: string }>(
        'select user_id,area from chats where id=$1',
        [conversationId],
      );
      if (!current.rows.length) {
        await client.query(
          "insert into chats(id,user_id,area,title,created_at,updated_at) values($1,$2,'workspace',$3,now(),now())",
          [conversationId, user.id, (prompt || 'Workspace task').slice(0, 80)],
        );
      } else if (current.rows[0].user_id !== user.id || current.rows[0].area !== 'workspace') {
        throw new Error('Conversation unavailable.');
      }

      await client.query(
        "insert into messages(id,chat_id,user_id,sender,content,created_at) values($1,$2,$3,'user',$4,clock_timestamp())",
        [userMessageId, conversationId, user.id, prompt || '[Image attachment]'],
      );
      await client.query(
        "insert into messages(id,chat_id,user_id,sender,content,created_at) values($1,$2,$3,'ai',$4,clock_timestamp())",
        [answerId, conversationId, user.id, answer],
      );
      await client.query('update chats set updated_at=now() where id=$1', [conversationId]);
      await client.query('select finish_credit_usage($1,$2,true)', [user.id, reservation]);
      const balance = await client.query<{ balance: string }>(
        'select available_credits($1)::text as balance',
        [user.id],
      );
      return Number(balance.rows[0]?.balance || 0);
    });
    reservation = undefined;

    // Best-effort low-balance top-up after a successful spend (never blocks the response).
    void maybeAttemptWorkspaceAutoReload(user.id).catch((error) => {
      console.error('Workspace auto-reload after spend failed:', error);
    });

    return reply({
      answer,
      answerId,
      userMessageId,
      conversationId,
      balance: nextBalance,
    });
  } catch (error) {
    if (reservation) {
      try {
        await finishWorkspaceCredits(user.id, reservation, false);
      } catch (refundError) {
        console.error('Workspace credit refund requires reconciliation:', refundError);
      }
    }
    const message = error instanceof Error ? error.message : '';
    const insufficientCredits = /not enough workspace credits|insufficient credits/i.test(message);

    if (insufficientCredits) {
      try {
        const reload = await maybeAttemptWorkspaceAutoReload(user.id);
        if (reload.charged) {
          return reply(
            {
              error:
                'Not enough Workspace credits. Auto-reload succeeded — please retry this task.',
              autoReload: true,
            },
            402,
          );
        }
      } catch (reloadError) {
        console.error('Workspace auto-reload on insufficient credits failed:', reloadError);
      }
    }

    const status = insufficientCredits ? 402 : message.includes('Too many') ? 429 : 503;
    return reply(
      {
        error: insufficientCredits
          ? 'Not enough Workspace credits. Add credits to continue.'
          : /AI is not configured|AI service|Too many/.test(message)
            ? message
            : 'Unable to complete this Workspace task. Please try again later.',
      },
      status,
    );
  }
}
