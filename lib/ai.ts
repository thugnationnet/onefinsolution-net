import 'server-only';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions/completions';
import type { ResponseInputItem } from 'openai/resources/responses/responses';
export interface AIImage {mimeType:'image/jpeg'|'image/png'|'image/webp'|'image/gif';data:string}
export function aiConfiguration() {
  const provider = process.env.AI_PROVIDER || 'openai';
  if (!['openai','xai'].includes(provider)) throw new Error('Unsupported AI provider.');
  return provider === 'openai'
    ? { provider, model: process.env.OPENAI_MODEL || 'gpt-4.1-mini', apiKey: process.env.OPENAI_API_KEY, baseURL:'https://api.openai.com/v1' }
    : { provider, model: process.env.XAI_MODEL || 'grok-4.3', apiKey: process.env.XAI_API_KEY, baseURL:'https://api.x.ai/v1' };
}
export async function generateResponse(messages: {sender:'user'|'ai';content:string}[], context?: string | null, images:AIImage[] = [], streaming?:{onDelta:(text:string)=>void;signal:AbortSignal}) {
  const configuration = aiConfiguration();
  if (!configuration.apiKey) throw new Error('AI is not configured yet. Please try again later.');
  const client = new OpenAI({apiKey:configuration.apiKey,baseURL:configuration.baseURL,timeout:60000,maxRetries:1});
  try {
    if (configuration.provider === 'openai') {
      const input:ResponseInputItem[]=messages.map((message,index)=>{
        if(message.sender==='user' && index===messages.length-1 && images.length) {
          return {
            type:'message',
            role:'user',
            content:[
              {type:'input_text',text:message.content},
              ...images.map(image=>({type:'input_image' as const,detail:'auto' as const,image_url:`data:${image.mimeType};base64,${image.data}`})),
            ],
          };
        }
        return {role:message.sender==='user'?'user':'assistant',content:message.content};
      });
      if(streaming) {
        const stream=await client.responses.create({model:configuration.model,store:false,max_output_tokens:2048,instructions:context?`Use the following user-supplied reference when relevant:\n${context}`:undefined,input,stream:true},{signal:streaming.signal});
        let text='',completed=false;
        for await(const event of stream) {
          if(event.type==='response.output_text.delta'){text+=event.delta;streaming.onDelta(event.delta);}
          if(event.type==='response.completed')completed=true;
          if(event.type==='error'||event.type==='response.failed'||event.type==='response.incomplete')throw new Error('The AI response did not complete. Please retry.');
        }
        if(!completed || !text.trim())throw new Error('The AI response did not complete. Please retry.');
        return text;
      }
      const result = await client.responses.create({model:configuration.model,store:false,max_output_tokens:2048,instructions:context ? `Use the following user-supplied reference when relevant:\n${context}` : undefined,input});
      if (!result.output_text?.trim()) throw new Error('The AI returned an empty response. Please try again.');
      return result.output_text;
    }
    const completionMessages:ChatCompletionMessageParam[]=[
      ...(context ? [{role:'system' as const,content:`Use this user-supplied reference when relevant:\n${context}`}] : []),
      ...messages.map((message,index)=>{
        if(message.sender==='user' && index===messages.length-1 && images.length) {
          return {
            role:'user' as const,
            content:[
              {type:'text' as const,text:message.content},
              ...images.map(image=>({type:'image_url' as const,image_url:{url:`data:${image.mimeType};base64,${image.data}`}})),
            ],
          };
        }
        return message.sender==='user'
          ? {role:'user' as const,content:message.content}
          : {role:'assistant' as const,content:message.content};
      }),
    ];
    if(streaming) {
      const stream=await client.chat.completions.create({model:configuration.model,messages:completionMessages,stream:true,max_tokens:2048},{signal:streaming.signal});
      let text='',completed=false;
      for await(const event of stream){const choice=event.choices[0];const delta=choice?.delta.content;if(delta){text+=delta;streaming.onDelta(delta);}if(choice?.finish_reason==='stop')completed=true;}
      if(!completed || !text.trim())throw new Error('The AI response did not complete. Please retry.');
      return text;
    }
    const result = await client.chat.completions.create({model:configuration.model,messages:completionMessages});
    const text = result.choices[0]?.message.content;
    if (!text?.trim()) throw new Error('The AI returned an empty response. Please try again.');
    return text;
  } catch(error) {
    if (error instanceof OpenAI.APIError) throw new Error(error.status===429 ? 'The AI service is busy. Please try again shortly.' : 'The AI service is temporarily unavailable. Please try again later.');
    throw error;
  }
}
