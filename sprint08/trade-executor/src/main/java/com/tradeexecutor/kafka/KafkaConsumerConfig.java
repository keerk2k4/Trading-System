package com.tradeexecutor.kafka;

import com.fasterxml.jackson.core.type.TypeReference;
import com.tradeexecutor.model.OrderPlacedEvent;
import org.apache.kafka.common.serialization.StringDeserializer;
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
    public ConsumerFactory<String, KafkaMessageEnvelope<OrderPlacedEvent>> consumerFactory(
            KafkaProperties kafkaProperties,
            SslBundles sslBundles) {
        var properties = kafkaProperties.buildConsumerProperties(sslBundles);

        // Avoid mixing property-based JsonDeserializer config with programmatic setters.
        properties.remove(JsonDeserializer.TRUSTED_PACKAGES);
        properties.remove(JsonDeserializer.VALUE_DEFAULT_TYPE);
        properties.remove(JsonDeserializer.USE_TYPE_INFO_HEADERS);

        JsonDeserializer<KafkaMessageEnvelope<OrderPlacedEvent>> valueDeserializer =
            new JsonDeserializer<>(new TypeReference<KafkaMessageEnvelope<OrderPlacedEvent>>() {});
        valueDeserializer.addTrustedPackages("*");
        valueDeserializer.ignoreTypeHeaders();

        return new DefaultKafkaConsumerFactory<>(properties, new StringDeserializer(), valueDeserializer);
    }

    /**
     * Create a Kafka listener container factory with manual acknowledgment.
     * Ensures messages are only acknowledged after successful processing.
     */
    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, KafkaMessageEnvelope<OrderPlacedEvent>> kafkaListenerContainerFactory(
            ConsumerFactory<String, KafkaMessageEnvelope<OrderPlacedEvent>> consumerFactory) {
        ConcurrentKafkaListenerContainerFactory<String, KafkaMessageEnvelope<OrderPlacedEvent>> factory =
            new ConcurrentKafkaListenerContainerFactory<>();

        factory.setCommonErrorHandler(new org.springframework.kafka.listener.DefaultErrorHandler());
        factory.setConcurrency(1);
        factory.getContainerProperties().setAckMode(ContainerProperties.AckMode.MANUAL);
        factory.setConsumerFactory(consumerFactory);

        return factory;
    }
}

