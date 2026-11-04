import { Button } from "../../../../components/Button/Button.tsx";
import { Link } from "react-router-dom";

export function Header() {
    return (
        <header className="grid gap-1">
            <h1 className="text-2xl font-bold">Список событий</h1>
            <p className="text-sm text-text-secondary">
                Выберите встречу и присоединяйтесь.
            </p>
            <Button asChild className="mt-4">
                <Link to="/event/new">Создать</Link>
            </Button>
        </header>
    );
}
