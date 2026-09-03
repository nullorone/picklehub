# Турниры: контекст

Tournament engine поддерживает индивидуальную и командную регистрацию, внешний ручной payment status и восемь versioned formats: Americano, round robin, single/double elimination, pool play, Swiss, ladder and king of the court.

Общие entrants/stages/rounds/matches/standings отделены от format strategy. Сначала presets и безопасные параметры; custom declarative DSL реализуется последним, без user JavaScript.
