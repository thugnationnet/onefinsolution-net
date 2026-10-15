// The provider and real model are selected only on the server through environment variables.
export const availableModels=[{id:'default',name:'default',displayName:'Configured AI model'}];
export const defaultModel='default';
// Preserve historical chat records while mapping their old preference to the configured provider.
export function normalizeModel(model?:string|null) { return availableModels.find(value=>value.id===model)?.id || defaultModel; }
