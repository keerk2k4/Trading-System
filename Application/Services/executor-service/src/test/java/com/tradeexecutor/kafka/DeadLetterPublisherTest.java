package com.tradeexecutor.kafka;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.core.KafkaTemplate;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

@ExtendWith(MockitoExtension.class)
@DisplayName("DeadLetterPublisher preserves the original payload and never rethrows")
class DeadLetterPublisherTest {

    @Mock
    private KafkaTemplate<String, byte[]> kafkaTemplate;

    private DeadLetterPublisher publisher;

    @BeforeEach
    void setUp() {
        publisher = new DeadLetterPublisher(kafkaTemplate);
    }

    @Test
    @DisplayName("Publishes bytes to the .DLT topic using the original key")
    void publishesOriginalBytesAndKey() {
        byte[] original = {1, 2, 3, 4};

        publisher.publishToDeadLetter("orders", "account-202", original, "permanent failure");

        ArgumentCaptor<byte[]> valueCaptor = ArgumentCaptor.forClass(byte[].class);
        verify(kafkaTemplate).send(
                org.mockito.ArgumentMatchers.eq("orders.DLT"),
                org.mockito.ArgumentMatchers.eq("account-202"),
                valueCaptor.capture()
        );
        assertSame(original, valueCaptor.getValue());
        assertArrayEquals(original, valueCaptor.getValue());
    }

    @Test
    @DisplayName("Kafka publication failure is swallowed after logging")
    void publicationFailureDoesNotEscape() {
        byte[] original = {9};
        doThrow(new IllegalStateException("DLT broker unavailable")).when(kafkaTemplate)
                .send("orders.DLT", "account-202", original);

        assertDoesNotThrow(() -> publisher.publishToDeadLetter(
                "orders", "account-202", original, "failure"
        ));
    }

    @Test
    @DisplayName("A null original payload is handled without sending")
    void nullPayloadIsHandledGracefully() {
        assertDoesNotThrow(() -> publisher.publishToDeadLetter(
                "orders", "account-202", null, "failure"
        ));

        verifyNoInteractions(kafkaTemplate);
    }
}
