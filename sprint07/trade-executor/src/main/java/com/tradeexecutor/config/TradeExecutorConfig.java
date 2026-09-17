package com.tradeexecutor.config;

import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.common.serialization.ByteArraySerializer;
import org.apache.kafka.common.serialization.StringSerializer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.core.DefaultKafkaProducerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.core.ProducerFactory;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.Map;

/**
 * Application configuration for Trade Executor.
 */
@Configuration
public class TradeExecutorConfig {
    
    @Value("${spring.kafka.bootstrap-servers:localhost:9092}")
    private String bootstrapServers;
    
    @Bean
    public RestTemplate restTemplate() {
        return new RestTemplate();
    }
    
    /**
     * KafkaTemplate for publishing byte arrays (raw messages) to dead-letter topics.
     * 
     * This template is used by DeadLetterPublisher to send original messages to DLT.
     */
    @Bean
    public KafkaTemplate<String, byte[]> kafkaByteTemplate() {
        ProducerFactory<String, byte[]> producerFactory = kafkaByteProducerFactory();
        return new KafkaTemplate<>(producerFactory);
    }
    
    /**
     * Producer factory configured for byte array serialization.
     */
    @Bean
    public ProducerFactory<String, byte[]> kafkaByteProducerFactory() {
        Map<String, Object> configProps = new HashMap<>();
        configProps.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        configProps.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        configProps.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, ByteArraySerializer.class);
        
        // Idempotent producer ensures at-most-once delivery of DLT messages
        configProps.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true);
        
        return new DefaultKafkaProducerFactory<>(configProps);
    }
}

