package com.tradeexecutor.poller;

import com.tradeexecutor.client.FauxnanceClient;
import com.tradeexecutor.kafka.KafkaProducer;
import com.tradeexecutor.mapper.PositionMapper;
import com.tradeexecutor.mapper.WatchlistMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("QuotePoller symbol discovery unions positions and watchlists without duplicates")
class QuotePollerWatchlistUnionTest {

    @Mock
    private PositionMapper positionMapper;
    @Mock
    private WatchlistMapper watchlistMapper;
    @Mock
    private FauxnanceClient fauxnanceClient;
    @Mock
    private KafkaProducer kafkaProducer;

    @Test
    @DisplayName("AAPL in two watchlists and one position is discovered once")
    void deduplicatesAcrossUsers() {
        when(positionMapper.findAllDistinctSymbols()).thenReturn(List.of("AAPL", "MSFT"));
        when(watchlistMapper.findAllDistinctWatchlistSymbols()).thenReturn(List.of("AAPL", "TSLA"));

        QuotePollerService poller = new QuotePollerService(
                positionMapper, watchlistMapper, fauxnanceClient, kafkaProducer, 30_000L);

        Set<String> symbols = poller.discoverSymbols();

        assertEquals(Set.of("AAPL", "MSFT", "TSLA"), symbols);
    }
}
