# from QuantConnect import Resolution
from QuantConnect.Algorithm import QCAlgorithm

# from QuantConnect.Data.Market import TradeBar
from QuantConnect.Indicators import StandardDeviation


class VwapStdDevStrategy(QCAlgorithm):
    def Initialize(self):
        print("Algorithm instance (self):", self)
        import sys

        sys.exit("Exiting early after printing self")

        # self.ticker = self.get_parameter("symbol") or "QQQ"
        self.stddev = float(self.get_parameter("stddev") or 1.0)
        self.resolution = self.get_parameter("resolution") or "QQQ"

        self.set_start_date(2022, 1, 1)
        self.set_end_date(2022, 1, 15)
        self.set_cash(100000)

        self.symbol = self.add_equity(self.symbol, self.resolution).Symbol

        self._vwap = self.VWAP(self.symbol, 30, self.resolution)
        self._std = StandardDeviation(30)
        self.RegisterIndicator(self.symbol, self._std, self.resolution)

        self.entry_price = None
        self.take_profit = None
        self.stop_loss = None

    def OnData(self, data):
        if not self._vwap.is_ready or not self._std.is_ready or self.symbol not in data:
            return

        # price = data[self.symbol].Close
        # vwap = self._vwap.current.value
        # std = self._std.current.value
        # upper = vwap + self.stddev_mult * std
        # lower = vwap - self.stddev_mult * std

        # invested = self.Portfolio[self.symbol].Invested

        # # Exit logic
        # if invested:
        #     holding = self.Portfolio[self.symbol]
        #     if holding.IsLong:
        #         if price >= self.take_profit or price <= self.stop_loss:
        #             self.Liquidate(self.symbol, "Exit Long")
        #     elif holding.IsShort:
        #         if price <= self.take_profit or price >= self.stop_loss:
        #             self.Liquidate(self.symbol, "Exit Short")
        #     return

        # # Entry logic
        # if price < lower:
        #     self.entry_price = price
        #     self.take_profit = (price + vwap) / 2
        #     self.stop_loss = (price + (vwap - 3 * std)) / 2
        #     self.SetHoldings(self.symbol, 1.0)
        #     self.Debug(f"Long: {price}, TP: {self.take_profit}, SL: {self.stop_loss}")

        # elif price > upper:
        #     self.entry_price = price
        #     self.take_profit = (price + vwap) / 2
        #     self.stop_loss = (price + (vwap + 3 * std)) / 2
        #     self.SetHoldings(self.symbol, -1.0)
        #     self.Debug(f"Short: {price}, TP: {self.take_profit}, SL: {self.stop_loss}")
