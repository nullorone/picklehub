export function formatAddress(address: string): string {
    return address.replace(
        /(^|[\s,])((?:ул|стр|д|корп|кв)\.,?)[ \t]+(?=\S)/giu,
        "$1$2\u00a0",
    );
}
