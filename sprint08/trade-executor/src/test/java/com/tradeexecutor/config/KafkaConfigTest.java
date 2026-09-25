package com.tradeexecutor.config;

import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.common.serialization.ByteArraySerializer;
import org.apache.kafka.common.serialization.StringSerializer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.kafka.core.DefaultKafkaProducerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

@DisplayName("KafkaConfig raw-bytes producer settings")
class KafkaConfigTest {

    private KafkaConfig kafkaConfig;

    @BeforeEach
    void setUp() {
        kafkaConfig = new KafkaConfig();
        ReflectionTestUtils.setField(kafkaConfig, "bootstrapServers", "broker-a:9092,broker-b:9092");
    }

    @Test
    @DisplayName("Raw bytes template uses string keys, byte-array values, and durable producer settings")
    void rawBytesTemplateContainsExpectedProducerSettings() {
        KafkaTemplate<String, byte[]> template = kafkaConfig.rawBytesKafkaTemplate();

        assertNotNull(template);
        assertNotNull(template.getProducerFactory());
        DefaultKafkaProducerFactory<String, byte[]> factory =
                (DefaultKafkaProducerFactory<String, byte[]>) template.getProducerFactory();
        Map<String, Object> properties = factory.getConfigurationProperties();

        assertEquals("broker-a:9092,broker-b:9092", properties.get(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG));
        assertEquals(StringSerializer.class, properties.get(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG));
        assertEquals(ByteArraySerializer.class, properties.get(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG));
        assertEquals("all", properties.get(ProducerConfig.ACKS_CONFIG));
        assertEquals(10, properties.get(ProducerConfig.RETRIES_CONFIG));
        assertEquals(true, properties.get(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG));
        assertEquals(5, properties.get(ProducerConfig.MAX_IN_FLIGHT_REQUESTS_PER_CONNECTION));
    }
}
