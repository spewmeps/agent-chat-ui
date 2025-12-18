import { Client } from "@langchain/langgraph-sdk";

// Helper functions for SSE decoding
const CR = "\r".charCodeAt(0);
const LF = "\n".charCodeAt(0);
const NULL = "\0".charCodeAt(0);
const COLON = ":".charCodeAt(0);
const SPACE = " ".charCodeAt(0);
const TRAILING_NEWLINE = [CR, LF];

function joinArrays(data: Uint8Array[]): Uint8Array {
  const totalLength = data.reduce((acc, curr) => acc + curr.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const c of data) {
    merged.set(c, offset);
    offset += c.length;
  }
  return merged;
}

function decodeArraysToJson(decoder: TextDecoder, data: Uint8Array[]) {
  try {
    return JSON.parse(decoder.decode(joinArrays(data)));
  } catch (e) {
    // Silently ignore or log warning for bad JSON
    // console.warn("Ignored invalid JSON chunk", e);
    return undefined;
  }
}

function BytesLineDecoder() {
  let buffer: Uint8Array[] = [];
  let trailingCr = false;
  return new TransformStream({
    start() {
      buffer = [];
      trailingCr = false;
    },
    transform(chunk, controller) {
      let text = chunk;
      if (trailingCr) {
        text = joinArrays([new Uint8Array([CR]), text]);
        trailingCr = false;
      }
      if (text.length > 0 && text.at(-1) === CR) {
        trailingCr = true;
        text = text.subarray(0, -1);
      }
      if (!text.length) return;
      const trailingNewline = TRAILING_NEWLINE.includes(text.at(-1));
      const lastIdx = text.length - 1;
      const { lines } = text.reduce(
        (acc: { lines: Uint8Array[]; from: number }, cur: number, idx: number) => {
          if (acc.from > idx) return acc;
          if (cur === CR || cur === LF) {
            acc.lines.push(text.subarray(acc.from, idx));
            if (cur === CR && text[idx + 1] === LF) acc.from = idx + 2;
            else acc.from = idx + 1;
          }
          if (idx === lastIdx && acc.from <= lastIdx)
            acc.lines.push(text.subarray(acc.from));
          return acc;
        },
        {
          lines: [],
          from: 0,
        }
      );
      if (lines.length === 1 && !trailingNewline) {
        buffer.push(lines[0]);
        return;
      }
      if (buffer.length) {
        buffer.push(lines[0]);
        lines[0] = joinArrays(buffer);
        buffer = [];
      }
      if (!trailingNewline) {
        if (lines.length) buffer = [lines.pop()!];
      }
      for (const line of lines) controller.enqueue(line);
    },
    flush(controller) {
      if (buffer.length) controller.enqueue(joinArrays(buffer));
    },
  });
}

function SafeSSEDecoder() {
  let event = "";
  let data: Uint8Array[] = [];
  let lastEventId = "";
  let retry: number | null = null;
  const decoder = new TextDecoder();
  return new TransformStream({
    transform(chunk, controller) {
      if (!chunk.length) {
        if (!event && !data.length && !lastEventId && retry == null) return;
        const jsonData = data.length ? decodeArraysToJson(decoder, data) : null;
        // Only enqueue if data is valid (undefined means parsing failed)
        if (jsonData !== undefined) {
          const sse = {
            id: lastEventId || undefined,
            event,
            data: jsonData,
          };
          controller.enqueue(sse);
        }
        event = "";
        data = [];
        retry = null;
        return;
      }
      if (chunk[0] === COLON) return;
      const sepIdx = chunk.indexOf(COLON);
      if (sepIdx === -1) return;
      const fieldName = decoder.decode(chunk.subarray(0, sepIdx));
      let value = chunk.subarray(sepIdx + 1);
      if (value[0] === SPACE) value = value.subarray(1);
      if (fieldName === "event") event = decoder.decode(value);
      else if (fieldName === "data") data.push(value);
      else if (fieldName === "id") {
        if (value.indexOf(NULL) === -1) lastEventId = decoder.decode(value);
      } else if (fieldName === "retry") {
        const retryNum = Number.parseInt(decoder.decode(value), 10);
        if (!Number.isNaN(retryNum)) retry = retryNum;
      }
    },
    flush(controller) {
      if (event) {
        const jsonData = data.length ? decodeArraysToJson(decoder, data) : null;
        if (jsonData !== undefined) {
          controller.enqueue({
            id: lastEventId || undefined,
            event,
            data: jsonData,
          });
        }
      }
    },
  });
}

const REGEX_RUN_METADATA =
  /(\/threads\/(?<thread_id>.+))?\/runs\/(?<run_id>.+)/;

function getRunMetadataFromResponse(response: Response) {
  const contentLocation = response.headers.get("Content-Location");
  if (!contentLocation) return undefined;
  const match = REGEX_RUN_METADATA.exec(contentLocation);
  if (!match?.groups?.run_id) return undefined;
  return {
    run_id: match.groups.run_id,
    thread_id: match.groups.thread_id || undefined,
  };
}

export function patchClient(client: Client): Client {
  // Monkey-patch the runs.stream method
  const originalStream = client.runs.stream;
  
  // We need to cast client.runs to any because we are accessing protected members
  // like prepareFetchOptions and asyncCaller which are on the base class
  const runsClient = client.runs as any;

  runsClient.stream = async function* (
    threadId: string,
    assistantId: string,
    payload: any
  ) {
    const json = {
      input: payload?.input,
      command: payload?.command,
      config: payload?.config,
      context: payload?.context,
      metadata: payload?.metadata,
      stream_mode: payload?.streamMode,
      stream_subgraphs: payload?.streamSubgraphs,
      stream_resumable: payload?.streamResumable,
      feedback_keys: payload?.feedbackKeys,
      assistant_id: assistantId,
      interrupt_before: payload?.interruptBefore,
      interrupt_after: payload?.interruptAfter,
      checkpoint: payload?.checkpoint,
      checkpoint_id: payload?.checkpointId,
      webhook: payload?.webhook,
      multitask_strategy: payload?.multitaskStrategy,
      on_completion: payload?.onCompletion,
      on_disconnect: payload?.onDisconnect,
      after_seconds: payload?.afterSeconds,
      if_not_exists: payload?.ifNotExists,
      checkpoint_during: payload?.checkpointDuring,
      durability: payload?.durability,
    };
    const endpoint =
      threadId == null ? `/runs/stream` : `/threads/${threadId}/runs/stream`;
    
    // Use the client's prepareFetchOptions
    let [url, init] = runsClient.prepareFetchOptions(endpoint, {
      method: "POST",
      json,
      timeoutMs: null,
      signal: payload?.signal,
    });

    if (runsClient.onRequest != null) init = await runsClient.onRequest(url, init);
    
    // Use the client's asyncCaller
    const response = await runsClient.asyncCaller.fetch(url, init);
    
    const runMetadata = getRunMetadataFromResponse(response);
    if (runMetadata) payload?.onRunCreated?.(runMetadata);

    const stream = (
      response.body ||
      new ReadableStream({
        start: (ctrl) => ctrl.close(),
      })
    )
      .pipeThrough(BytesLineDecoder())
      .pipeThrough(SafeSSEDecoder()); // Use our safe decoder

    // Manual iteration instead of IterableReadableStream
    const reader = stream.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  };

  return client;
}
