import {
    CompactStockWidget,
    CryptoWidget,
    MarketOverviewWidget,
    PortfolioWidget,
    StockTickerWidget,
} from '@picklehub/ui-web';
export default { title: 'Widgets/Stocks' };
export const Example1 = {
    name: 'Stock Ticker',
    render: () => (
        <StockTickerWidget
            symbol="AAPL"
            name="Apple Inc."
            price={178.23}
            change={2.45}
            changePercent={1.39}
            chartData={[175, 176.5, 175.8, 177, 178.5, 177.8, 178.23]}
        />
    ),
};
export const Example2 = {
    name: 'Compact Stock Card',
    render: () => <CompactStockWidget symbol="TSLA" price={245.67} change={-3.21} changePercent={-1.29} />,
};
export const Example3 = {
    name: 'Portfolio Overview',
    render: () => (
        <PortfolioWidget
            totalValue={125430.5}
            totalChange={3.24}
            holdings={[
                { symbol: 'AAPL', name: 'Apple', shares: 100, avgCost: 150, currentPrice: 178.23 },
                { symbol: 'MSFT', name: 'Microsoft', shares: 50, avgCost: 300, currentPrice: 378.91 },
                { symbol: 'GOOGL', name: 'Alphabet', shares: 25, avgCost: 120, currentPrice: 141.8 },
            ]}
        />
    ),
};
export const Example4 = {
    name: 'Market Overview',
    render: () => (
        <MarketOverviewWidget
            indices={[
                { name: 'S&P 500', value: 4783.45, change: 23.54, changePercent: 0.49 },
                { name: 'Dow Jones', value: 37440.34, change: -45.23, changePercent: -0.12 },
                { name: 'NASDAQ', value: 15043.97, change: 102.56, changePercent: 0.69 },
            ]}
        />
    ),
};
export const Example5 = {
    name: 'Crypto Widget',
    render: () => (
        <CryptoWidget
            symbol="BTC"
            name="Bitcoin"
            price={43250.45}
            change24h={2.34}
            marketCap="$845B"
            volume24h="$28.4B"
            sparkline={[42000, 42500, 42200, 43000, 43500, 43200, 43250]}
        />
    ),
};
