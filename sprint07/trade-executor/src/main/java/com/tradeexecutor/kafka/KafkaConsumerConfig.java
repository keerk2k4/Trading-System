package com.tradeexecutor.kafka;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.common.serialization.ByteArrayDeserializer;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.annotation.EnableKafka;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.config.KafkaListenerContainerFactory;
import org.springframework.kafka.core.DefaultKafkaConsumerFactory;
import org.springframework.kafka.listener.ConcurrentMessageListenerContainer;
import org.springframework.kafka.listener.ContainerProperties;

import java.util.HashMap;
import java.util.Map;

/**
 * Kafka consumer configuration.
 * 
 * Configures Spring Kafka consumer properties and settings for proper error handling:
 * - Byte array deserialization for raw message access
 * - Manual offset management for DLT decision
 * - Single-threaded processing per partition for ordering guarantee
 */
@Configuration
@EnableKafka
public class KafkaConsumerConfig {
    
    /**
     * Kafka listener container factory with byte array deserialization.
     * 
     * Uses ByteArrayDeserializer to receive raw message bytes, allowing us to:
     * 1. Preserve the original message for dead-lettering
     * 2. Deserialize conditionally based on message content
     * 3. Handle malformed JSON explicitly as a permanent failure
     * 
     * Manual offset management ensures we only commit after the DLT decision is made.
     */
    @Bean
    public KafkaListenerContainerFactory<ConcurrentMessageListenerContainer<String, byte[]>>
    kafkaListenerContainerFactory() {
        
        ConcurrentKafkaListenerContainerFactory<String, byte[]> factory =
            new ConcurrentKafkaListenerContainerFactory<>();
        
        factory.setConsumerFactory(consumerFactory());
        
        // Manual offset management: we commit only after DLT decision
        factory.getContainerProperties().setAckMode(ContainerProperties.AckMode.MANUAL);
        
        // Single-threaded processing per partition to maintain ordering
        factory.setConcurrency(1);
        
        return factory;
    }
    
    /**
     * Consumer factory configured for byte array deserialization.
     */
    @Bean
    public DefaultKafkaConsumerFactory<String, byte[]> consumerFactory() {
        Map<String, Object> props = new HashMap<>();
        
        // Consumer group and bootstrap servers (from application.yml)
        props.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        props.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, ByteArrayDeserializer.class);
        
        // Auto offset reset to earliest to replay from beginning if needed
        props.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        
        // Disable auto commit - we manage it manually
        props.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, false);
        
        // Session timeout and heartbeat for failure detection
        props.put(ConsumerConfig.SESSION_TIMEOUT_MS_CONFIG, 30000);
        props.put(ConsumerConfig.HEARTBEAT_INTERVAL_MS_CONFIG, 10000);
        
        return new DefaultKafkaConsumerFactory<>(props);
    }
    
    /**
     * ObjectMapper bean for JSON deserialization in the consumer.
     */
    @Bean
    public ObjectMapper objectMapper() {
        return new ObjectMapper();
    }
}


