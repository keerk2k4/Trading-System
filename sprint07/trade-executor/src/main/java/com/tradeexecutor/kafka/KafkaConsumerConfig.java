package com.tradeexecutor.kafka;

import org.springframework.boot.autoconfigure.kafka.KafkaProperties;
import org.springframework.boot.ssl.SslBundles;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.annotation.EnableKafka;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.kafka.core.DefaultKafkaConsumerFactory;
import org.springframework.kafka.listener.ContainerProperties;
import org.springframework.kafka.support.serializer.JsonDeserializer;

/**
 * Kafka consumer configuration.
 *
 * Configures Spring Kafka consumer with manual acknowledgment and JSON deserialization.
 */
@Configuration
@EnableKafka
public class KafkaConsumerConfig {

    /**
     * Create a consumer factory with JSON deserialization configured.
     * Ignores unknown properties for forward compatibility.
     */
    @Bean
    public ConsumerFactory<String, Object> consumerFactory(KafkaProperties kafkaProperties, SslBundles sslBundles) {
        var properties = kafkaProperties.getConsumer().buildProperties(sslBundles);

        // Configure JSON deserializer to ignore unknown properties
        properties.put(JsonDeserializer.VALUE_DEFAULT_TYPE, KafkaMessageEnvelope.class.getName());
        properties.put(JsonDeserializer.TRUSTED_PACKAGES, "*");
        properties.put(JsonDeserializer.USE_TYPE_INFO_HEADERS, false);

        return new DefaultKafkaConsumerFactory<>(properties);
    }

    /**
     * Create a Kafka listener container factory with manual acknowledgment.
     * Ensures messages are only acknowledged after successful processing.
     */
    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, Object> kafkaListenerContainerFactory(
            ConsumerFactory<String, Object> consumerFactory) {
        ConcurrentKafkaListenerContainerFactory<String, Object> factory =
            new ConcurrentKafkaListenerContainerFactory<>();

        factory.setCommonErrorHandler(new org.springframework.kafka.listener.DefaultErrorHandler());
        factory.setConcurrency(1);
        factory.getContainerProperties().setAckMode(ContainerProperties.AckMode.MANUAL);
        factory.setConsumerFactory(consumerFactory);

        return factory;
    }
}

