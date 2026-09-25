package com.tradeexecutor.kafka;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tradeexecutor.model.OrderPlacedEvent;
import org.apache.kafka.common.header.internals.RecordHeaders;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.boot.autoconfigure.kafka.KafkaProperties;
import org.springframework.boot.ssl.SslBundles;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.kafka.core.DefaultKafkaConsumerFactory;
import org.springframework.kafka.listener.ContainerProperties;
import org.springframework.kafka.support.serializer.JsonDeserializer;

import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("KafkaConsumerConfig deserializers and listener factory settings")
@SuppressWarnings({"rawtypes", "unchecked"})
class KafkaConsumerConfigTest {

    @Mock
    private KafkaProperties kafkaProperties;

    @Test
    @DisplayName("Consumer factory removes conflicting JsonDeserializer properties and retains other settings")
    void consumerFactoryConfiguresTypedJsonDeserializer() throws Exception {
        Map<String, Object> properties = new HashMap<>();
        properties.put("bootstrap.servers", "broker:9092");
        properties.put(JsonDeserializer.TRUSTED_PACKAGES, "old.package");
        properties.put(JsonDeserializer.VALUE_DEFAULT_TYPE, "old.Type");
        properties.put(JsonDeserializer.USE_TYPE_INFO_HEADERS, false);
        when(kafkaProperties.buildConsumerProperties(any(SslBundles.class))).thenReturn(properties);

        ConsumerFactory<String, KafkaMessageEnvelope<OrderPlacedEvent>> consumerFactory =
                new KafkaConsumerConfig().consumerFactory(kafkaProperties, mock(SslBundles.class));

        DefaultKafkaConsumerFactory<String, KafkaMessageEnvelope<OrderPlacedEvent>> defaultFactory =
                (DefaultKafkaConsumerFactory<String, KafkaMessageEnvelope<OrderPlacedEvent>>) consumerFactory;
        Map<String, Object> configuredProperties = defaultFactory.getConfigurationProperties();

        assertEquals("broker:9092", configuredProperties.get("bootstrap.servers"));
        assertFalse(configuredProperties.containsKey(JsonDeserializer.TRUSTED_PACKAGES));
        assertFalse(configuredProperties.containsKey(JsonDeserializer.VALUE_DEFAULT_TYPE));
        assertFalse(configuredProperties.containsKey(JsonDeserializer.USE_TYPE_INFO_HEADERS));
        assertInstanceOf(StringDeserializer.class, defaultFactory.getKeyDeserializer());
        assertInstanceOf(JsonDeserializer.class, defaultFactory.getValueDeserializer());

        OrderPlacedEvent payload = new OrderPlacedEvent();
        payload.setOrderId("77");
        payload.setAccountId(88L);
        payload.setSymbol("AAPL");
        String json = new ObjectMapper().writeValueAsString(
                new KafkaMessageEnvelope<>("event-77", "ORDER_PLACED", "2024-01-01T00:00:00Z", "trade-api", 1, payload)
        );

        Object decoded = ((JsonDeserializer) defaultFactory.getValueDeserializer())
                .deserialize("orders", new RecordHeaders(), json.getBytes());
        assertInstanceOf(KafkaMessageEnvelope.class, decoded);
        KafkaMessageEnvelope<?> envelope = (KafkaMessageEnvelope<?>) decoded;
        assertEquals("event-77", envelope.eventId());
        assertEquals("77", ((OrderPlacedEvent) envelope.payload()).getOrderId());
    }

    @Test
    @DisplayName("Listener factory uses the supplied consumer and manual acknowledgments")
    void listenerFactoryUsesManualAcknowledgment() {
        ConsumerFactory<String, KafkaMessageEnvelope<OrderPlacedEvent>> consumerFactory = mock(ConsumerFactory.class);

        ConcurrentKafkaListenerContainerFactory<String, KafkaMessageEnvelope<OrderPlacedEvent>> factory =
                new KafkaConsumerConfig().kafkaListenerContainerFactory(consumerFactory);

        assertNotNull(factory);
        assertSame(consumerFactory, factory.getConsumerFactory());
        assertEquals(ContainerProperties.AckMode.MANUAL, factory.getContainerProperties().getAckMode());
    }
}
