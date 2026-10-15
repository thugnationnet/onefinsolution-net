import { IdeInterfaceComponent } from '@/components/ide-interface';

export const metadata = {
  title: 'AI Chat and Software Workspace',
  description: 'Start an AI-powered conversation, explore practical software tools, and discover the One Fin Solution Workspace.',
  alternates: { canonical: '/' },
};

export default function Home() {
  return <IdeInterfaceComponent />;
}
