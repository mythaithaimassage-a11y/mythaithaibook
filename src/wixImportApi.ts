export async function readWixResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    let message = `Server returned status ${response.status}.`;
    try {
      const data: { message?: string } = JSON.parse(text);
      if (data.message) message = data.message;
    } catch {
      // Hosting limits may return a non-JSON error page.
    }
    throw new Error(message);
  }
  return response.json();
}
