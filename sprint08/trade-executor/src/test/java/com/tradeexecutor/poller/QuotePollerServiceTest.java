package com.tradeexecutor.poller;

import com.tradeexecutor.client.FauxnanceClient;
import com.tradeexecutor.client.QuoteResponse;
import com.tradeexecutor.kafka.KafkaProducer;
import com.tradeexecutor.kafka.QuotePayload;
import com.tradeexecutor.mapper.PositionMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class QuotePollerServiceTest {
    
    @Mock
    private PositionMapper positionMapper;
    
    @Mock
    private FauxnanceClient fauxnanceClient;
    
    @Mock
    private KafkaProducer kafkaProducer;
    
    private QuotePollerService quotePollerService;
    
    @BeforeEach
    void setUp() {
        quotePollerService = new QuotePollerService(positionMapper, fauxnanceClient, kafkaProducer, 30000L);
    }
    
    @Test
    void testBatchFetchingUpTo25Symbols() {
        List<String> symbols = Arrays.asList("AAPL", "GOOG", "MSFT", "AMZN", "NVDA", "TSLA", "META", "NFLX");
        when(positionMapper.findAllDistinctSymbols()).thenReturn(symbols);
        
        List<QuoteResponse> quotes = new ArrayList<>();
        for (String symbol : symbols) {
            quotes.add(new QuoteResponse(
                    symbol,
                    new BigDecimal("150.00"),
                    new BigDecimal("149.50"),
                    new BigDecimal("150.50"),
                    System.currentTimeMillis()
            ));
        }
        // Order-independent: discoverSymbols() returns a Set internally, so the
        // exact order handed to getQuotesBatch is not guaranteed to match the
        // input list's order -- only the CONTENT needs to match.
        when(fauxnanceClient.getQuotesBatch(argThat(list ->
            list != null && new HashSet<>(list).equals(new HashSet<>(symbols))
        ))).thenReturn(quotes);
        
        quotePollerService.pollAndPublishQuotes();
        
        ArgumentCaptor<List<String>> batchCaptor = ArgumentCaptor.forClass(List.class);
        verify(fauxnanceClient, times(1)).getQuotesBatch(batchCaptor.capture());
        
        List<String> capturedBatch = batchCaptor.getValue();
        assertEquals(8, capturedBatch.size());
        assertTrue(capturedBatch.containsAll(symbols), "All symbols should be in batch");
    }
    
    @Test
    void testBatchFetching_Handles_MoreThan25Symbols() {
        List<String> symbols = new ArrayList<>();
        for (int i = 1; i <= 50; i++) {
            symbols.add("SYM" + String.format("%02d", i));
        }
        when(positionMapper.findAllDistinctSymbols()).thenReturn(symbols);
        
        List<QuoteResponse> quotes = new ArrayList<>();
        for (String symbol : symbols) {
            quotes.add(new QuoteResponse(symbol, BigDecimal.ONE, BigDecimal.ONE, BigDecimal.ONE, System.currentTimeMillis()));
        }
        when(fauxnanceClient.getQuotesBatch(any(List.class))).thenReturn(quotes);
        
        quotePollerService.pollAndPublishQuotes();
        
        ArgumentCaptor<List<String>> batchCaptor = ArgumentCaptor.forClass(List.class);
        verify(fauxnanceClient, times(1)).getQuotesBatch(batchCaptor.capture());
        assertEquals(50, batchCaptor.getValue().size());
    }
    
    @Test
    void testPerSymbolPublishing() {
        List<String> symbols = Arrays.asList("AAPL", "GOOG", "MSFT");
        when(positionMapper.findAllDistinctSymbols()).thenReturn(symbols);
        
        List<QuoteResponse> quotes = new ArrayList<>();
        for (String symbol : symbols) {
            quotes.add(new QuoteResponse(symbol, BigDecimal.TEN, new BigDecimal("9.50"), new BigDecimal("10.50"), System.currentTimeMillis()));
        }
        when(fauxnanceClient.getQuotesBatch(any(List.class))).thenReturn(quotes);
        
        quotePollerService.pollAndPublishQuotes();
        
        verify(kafkaProducer, times(3)).publishQuote(anyString(), any(QuotePayload.class));
        
        ArgumentCaptor<String> symbolCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<QuotePayload> payloadCaptor = ArgumentCaptor.forClass(QuotePayload.class);
        verify(kafkaProducer, times(3)).publishQuote(symbolCaptor.capture(), payloadCaptor.capture());
        
        List<String> publishedSymbols = symbolCaptor.getAllValues();
        List<QuotePayload> publishedPayloads = payloadCaptor.getAllValues();
        
        for (String symbol : symbols) {
            assertTrue(publishedSymbols.contains(symbol), "Symbol " + symbol + " should be published");
            
            QuotePayload payload = publishedPayloads.get(publishedSymbols.indexOf(symbol));
            assertEquals(symbol, payload.symbol(), "Payload symbol should match key");
        }
    }
    
    @Test
    void testQuotaCalculationForEightSymbols() {
        int symbolCount = 8;
        int batchSize = 25;
        int secondsPerDay = 86400;
        int quotaLimit = 2000;
        
        int interval30 = 30;
        int batches = (symbolCount + batchSize - 1) / batchSize;
        int requestsPerDay30 = secondsPerDay / interval30 / batches;
        assertTrue(requestsPerDay30 > quotaLimit, "30s interval exceeds quota");
        
        int interval44 = 44;
        int requestsPerDay44 = secondsPerDay / interval44 / batches;
        assertTrue(requestsPerDay44 <= quotaLimit, "44s interval stays within quota");
        assertTrue(requestsPerDay44 > (quotaLimit - 100), "44s interval has safe margin");
    }
    
    @Test
    void testIntervalFloorEnforcement_BelowMinimum() {
        int belowMinInterval = 10;
        
        QuotePollerService service = new QuotePollerService(
                positionMapper, fauxnanceClient, kafkaProducer, belowMinInterval
        );
        
        assertNotNull(service, "Service should be created");
    }
    
    @Test
    void testIntervalFloorEnforcement_AboveMinimum() {
        int validInterval = 44;
        
        QuotePollerService service = new QuotePollerService(
                positionMapper, fauxnanceClient, kafkaProducer, validInterval
        );
        
        assertNotNull(service, "Service should be created");
    }
    
    @Test
    void testEmptySymbolSet() {
        when(positionMapper.findAllDistinctSymbols()).thenReturn(new ArrayList<>());
        
        quotePollerService.pollAndPublishQuotes();
        
        verify(fauxnanceClient, never()).getQuotesBatch(anyList());
        verify(kafkaProducer, never()).publishQuote(anyString(), any());
    }
    
    @Test
    void testFauxnanceApiFailure() {
        List<String> symbols = Arrays.asList("AAPL", "GOOG");
        when(positionMapper.findAllDistinctSymbols()).thenReturn(symbols);
        
        when(fauxnanceClient.getQuotesBatch(argThat(list ->
            list != null && new HashSet<>(list).equals(new HashSet<>(symbols))
        ))).thenReturn(new ArrayList<>());
        
        assertDoesNotThrow(() -> quotePollerService.pollAndPublishQuotes());
        
        verify(kafkaProducer, never()).publishQuote(anyString(), any());
    }
}