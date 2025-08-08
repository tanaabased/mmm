from QuantConnect import Resolution
from QuantConnect.Algorithm import QCAlgorithm
from QuantConnect.Data import Slice
from QuantConnect.Orders import OrderEvent, OrderStatus, OrderTicket


class SimpleEmaBreakout(QCAlgorithm):

    def Initialize(self):
        self._symbol = "QQQ"
        self.resolution = Resolution.MINUTE
        self.ema_length = 20

        self.set_start_date(2020, 1, 1)
        self.set_cash(100000)

        self.symbol = self.add_equity(self._symbol, self.resolution).Symbol
        self._ema = self.ema(self._symbol, self.ema_length, self.resolution)

        self.entry_bar = None  # will hold the first bar above EMA
        self.entry_ticket = None

    def OnData(self, data: Slice):
        # wait until EMA is ready
        if not self._ema.is_ready or self.entry_ticket:
            return

        bar = data.bars[self._symbol]
        # detect first close above EMA
        if bar.close > self._ema.current.value:
            self.entry_bar = bar
            # place a stop-market entry a few ticks above the high
            stop_price = bar.high + 0.02
            quantity = int(self.portfolio.cash / stop_price)
            self.entry_ticket = self.stop_market_order(self._symbol, quantity, stop_price)

    def OnOrderEvent(self, order_event: OrderEvent):
        if self.entry_ticket is OrderTicket:
            if order_event.status == OrderStatus.FILLED and order_event.order_id == self.entry_ticket.order_id:

                fill_price = order_event.fill_price
                qty = order_event.fill_quantity

                # take profit at +0.4%
                tp_price = fill_price * 1.004
                self.limit_order(self._symbol, -qty, tp_price)

                # stop loss at –0.1%
                sl_price = fill_price * 0.999
                self.stop_market_order(self._symbol, -qty, sl_price)
