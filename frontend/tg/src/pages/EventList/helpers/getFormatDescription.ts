import { GameEvent } from "../types.ts";

export function getFormatDescription(format: GameEvent["format"]) {
    switch (format) {
        case "American":
            return "Смена партнёров каждые 2 игры для сбалансированной игры";
        case "Round Robin":
            return "Каждая команда играет с каждой";
        case "Single Elimination":
            return "Команда выбывает после одного поражения";
        case "Double Elimination":
            return "Команда выбывает после двух поражений";
        case "Pool Play":
            return "Групповой этап, затем игры на выбывание";
        case "Swiss System":
            return "Соперники подбираются по схожим результатам";
        case "Ladder":
            return "Бросайте вызов игрокам выше вас в таблице";
        case "King of the Court":
            return "Победители остаются на корте, проигравших сменяют другие игроки";
        default:
            return "";
    }
}
