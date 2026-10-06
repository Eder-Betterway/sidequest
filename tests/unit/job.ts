/** Read a progress-streaming route's answer: every event, and the result's data. */
export async function readJobResponse(
  res: Response
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- each test checks the fields it needs
): Promise<{ events: { type: string; stage?: string; count?: number; total?: number }[]; data: any; error?: string }> {
  const events = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
  const last = events[events.length - 1];
  return { events, data: last.type === "result" ? last.data : null, error: last.type === "error" ? last.error : undefined };
}
