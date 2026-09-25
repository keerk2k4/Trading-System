package com.tradeexecutor.poller;

import com.tradeexecutor.client.FauxnanceClient;
import com.tradeexecutor.client.QuoteResponse;
import com.tradeexecutor.kafka.KafkaProducer;
import com.tradeexecutor.kafka.QuotePayload;
import com.tradeexecutor.mapper.PositionMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("QuotePollerService resilience and quote normalization")
class QuotePollerServiceEdgeCaseTest {

    @Mock
    private PositionMapper positionMapper;
    @Mock
    private FauxnanceClient fauxnanceClient;
    @Mock
    private KafkaProducer kafkaProducer;

    private QuotePollerService poller;

    @BeforeEach
    void setUp() {
        poller = new QuotePollerService(positionMapper, fauxnanceClient, kafkaProducer, 30_000L);
    }

    @Test
    @DisplayName("A symbol discovery failure is contained and does not call the external client")
    void symbolDiscoveryFailureIsContained() {
        when(positionMapper.findAllDistinctSymbols())
                .thenThrow(new IllegalStateException("database unavailable"));

        assertDoesNotThrow(() -> poller.pollAndPublishQuotes());

        verify(fauxnanceClient, never()).getQuotesBatch(anyList());
        verify(kafkaProducer, never()).publishQuote(anyString(), any(QuotePayload.class));
    }

    @Test
    @DisplayName("Missing optional quote metadata gets safe defaults before publication")
    void quoteMetadataDefaultsAreApplied() {
        QuoteResponse quote = new QuoteResponse(
                "AAPL", new BigDecimal("100.00"), new BigDecimal("99.99"),
                new BigDecimal("100.01"), 123L
        );
        when(positionMapper.findAllDistinctSymbols()).thenReturn(List.of("AAPL"));
        when(fauxnanceClient.getQuotesBatch(anyList())).thenReturn(List.of(quote));

        poller.pollAndPublishQuotes();

        ArgumentCaptor<QuotePayload> payloadCaptor = ArgumentCaptor.forClass(QuotePayload.class);
        verify(kafkaProducer).publishQuote(anyString(), payloadCaptor.capture());
        QuotePayload payload = payloadCaptor.getValue();
        assertEquals("USD", payload.currency());
        assertEquals("unknown", payload.marketState());
        assertNotNull(payload.quoteAsOf());
        assertEquals(false, payload.stale());
    }

    @Test
    @DisplayName("A publish failure for one quote does not fail the polling cycle")
    void publishFailureDoesNotAbortPolling() {
        QuoteResponse quote = new QuoteResponse(
                "AAPL", BigDecimal.TEN, new BigDecimal("9.99"), new BigDecimal("10.01"), 123L
        );
        when(positionMapper.findAllDistinctSymbols()).thenReturn(List.of("AAPL"));
        when(fauxnanceClient.getQuotesBatch(anyList())).thenReturn(List.of(quote));
        doThrow(new IllegalStateException("Kafka unavailable")).when(kafkaProducer)
                .publishQuote(anyString(), any(QuotePayload.class));

        assertDoesNotThrow(() -> poller.pollAndPublishQuotes());

        verify(kafkaProducer).publishQuote(eqSymbol("AAPL"), any(QuotePayload.class));
    }

    private String eqSymbol(String symbol) {
        return org.mockito.ArgumentMatchers.eq(symbol);
    }
}
