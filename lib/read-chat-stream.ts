export async function readChatStream(response:Response,onDelta:(text:string)=>void) {
 if(!response.ok){const body=await response.json();throw new Error(body.error||'Unable to start response.');}
 if(!response.body)throw new Error('Streaming is unavailable.');
 const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',final:string|undefined;
 try {
 for(;;){const chunk=await reader.read();buffer+=decoder.decode(chunk.value,{stream:!chunk.done});const lines=buffer.split('\n');buffer=lines.pop()||'';
 for(const line of lines){if(!line)continue;const event=JSON.parse(line);if(event.error)throw new Error(event.error);if(typeof event.delta==='string')onDelta(event.delta);if(event.done&&typeof event.response==='string')final=event.response;}
 if(chunk.done)break;}
 if(final===undefined)throw new Error('The response was interrupted. Please retry.');return final;
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
