package com.tradeexecutor.config;

import com.tradeexecutor.kafka.KafkaMessageEnvelope;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.common.serialization.ByteArraySerializer;
import org.apache.kafka.common.serialization.StringSerializer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.core.DefaultKafkaProducerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.core.ProducerFactory;
import org.springframework.kafka.support.serializer.JsonSerializer;

import java.util.HashMap;
import java.util.Map;

/**
 * Kafka configuration for the trade-executor service.
 * 
 * Configures:
 * 1. KafkaTemplate<String, KafkaMessageEnvelope<?>> for publishing events to main topics
 * 2. KafkaTemplate<String, byte[]> for publishing to dead-letter topics
 * 3. Producer settings: idempotence, acks, retries
 */
@Configuration
public class KafkaConfig {
    
    @Value("${spring.kafka.bootstrap-servers}")
    private String bootstrapServers;
    
    /**
     * Create a KafkaTemplate for publishing KafkaMessageEnvelope to main topics.
     * 
     * This is used by KafkaProducer to send events to orders, trade-events, and market-data topics.
     * Uses JSON serialization for the envelope and payload.
     */
    @Bean
    public KafkaTemplate<String, KafkaMessageEnvelope<?>> kafkaTemplate() {
        return new KafkaTemplate<>(kafkaProducerFactory());
    }
    
    private ProducerFactory<String, KafkaMessageEnvelope<?>> kafkaProducerFactory() {
        Map<String, Object> configProps = new HashMap<>();
        configProps.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        configProps.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        configProps.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, JsonSerializer.class);
        configProps.put(ProducerConfig.ACKS_CONFIG, "all");
        configProps.put(ProducerConfig.RETRIES_CONFIG, 10);
        configProps.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true);
        configProps.put(ProducerConfig.MAX_IN_FLIGHT_REQUESTS_PER_CONNECTION, 5);
        
        return new DefaultKafkaProducerFactory<>(configProps);
    }
    
    /**
     * Create a KafkaTemplate for publishing raw bytes to dead-letter topics.
     * 
     * This is used by DeadLetterPublisher to send the original message bytes
     * to the dead-letter topic without deserialization/re-serialization.
     */
    @Bean
    public KafkaTemplate<String, byte[]> rawBytesKafkaTemplate() {
        return new KafkaTemplate<>(rawBytesProducerFactory());
    }
    
    private ProducerFactory<String, byte[]> rawBytesProducerFactory() {
        Map<String, Object> configProps = new HashMap<>();
        configProps.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        configProps.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        configProps.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, ByteArraySerializer.class);
        configProps.put(ProducerConfig.ACKS_CONFIG, "all");
        configProps.put(ProducerConfig.RETRIES_CONFIG, 10);
        configProps.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true);
        configProps.put(ProducerConfig.MAX_IN_FLIGHT_REQUESTS_PER_CONNECTION, 5);
        
        return new DefaultKafkaProducerFactory<>(configProps);
    }
}
