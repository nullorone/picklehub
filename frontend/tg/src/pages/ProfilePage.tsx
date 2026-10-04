import { useSessionUser } from "@/api/session.ts";
import { Card } from "@/components/ui/Card/Card.tsx";

export function ProfilePage() {
    const user = useSessionUser();

    return (
        <main className="mx-auto grid w-full max-w-lg gap-6 px-4 py-8 sm:px-6">
            <h1 className="text-2xl font-bold">Профиль</h1>
            <Card>
                <p className="break-words text-lg font-semibold">
                    {user?.displayName}
                </p>
            </Card>
        </main>
    );
}
