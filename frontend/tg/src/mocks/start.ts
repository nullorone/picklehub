export async function startApiMocks() {
    if (!import.meta.env.DEV || import.meta.env.VITE_API_MOCKS === "false")
        return;
    const { worker } = await import("@/mocks/worker.ts");
    await worker.start({ onUnhandledRequest: "bypass" });
}
