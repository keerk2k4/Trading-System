package com.tradeexecutor.kafka;

import org.apache.kafka.clients.admin.Admin;
import org.apache.kafka.clients.admin.DescribeClusterOptions;
import org.apache.kafka.clients.admin.DescribeClusterResult;
import org.apache.kafka.common.KafkaFuture;
import org.apache.kafka.common.Node;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.Status;

import java.time.Duration;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class KafkaHealthIndicatorTest {

    private Admin admin;
    private DescribeClusterResult cluster;
    private KafkaFuture<Collection<Node>> nodes;
    private KafkaHealthIndicator indicator;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        admin = mock(Admin.class);
        cluster = mock(DescribeClusterResult.class);
        nodes = mock(KafkaFuture.class);
        when(admin.describeCluster(any(DescribeClusterOptions.class))).thenReturn(cluster);
        when(cluster.nodes()).thenReturn(nodes);
        indicator = new KafkaHealthIndicator(() -> admin);
    }

    @Test
    void reportsUpWithBrokerCountWhenTheClusterAnswers() throws Exception {
        when(nodes.get(anyLong(), any(TimeUnit.class))).thenReturn(List.of(new Node(1, "broker", 9092)));

        Health health = indicator.health();

        assertEquals(Status.UP, health.getStatus());
        assertEquals(1, health.getDetails().get("brokers"));
    }

    @Test
    void reportsDownWhenTheBrokerDoesNotAnswerInTime() throws Exception {
        when(nodes.get(anyLong(), any(TimeUnit.class))).thenThrow(new TimeoutException());

        Health health = indicator.health();

        assertEquals(Status.DOWN, health.getStatus());
        assertEquals(Map.of("detail", "No response within 2 s"), health.getDetails());
    }

    @Test
    void reportsDownWithoutTheClientErrorTextWhenTheBrokerIsUnreachable() throws Exception {
        when(nodes.get(anyLong(), any(TimeUnit.class)))
                .thenThrow(new ExecutionException(new RuntimeException("kafka-internal.corp:9092 refused")));

        Health health = indicator.health();

        assertEquals(Status.DOWN, health.getStatus());
        assertEquals(Map.of("detail", "Broker unreachable"), health.getDetails());
    }

    @Test
    void reportsDownWhenTheAdminClientCannotBeCreated() {
        KafkaHealthIndicator failing = new KafkaHealthIndicator(() -> {
            throw new IllegalStateException("bad bootstrap.servers");
        });

        assertEquals(Status.DOWN, failing.health().getStatus());
    }

    @Test
    void closesTheAdminClientAfterEveryCheck() throws Exception {
        when(nodes.get(anyLong(), any(TimeUnit.class))).thenThrow(new TimeoutException());

        indicator.health();

        verify(admin).close(Duration.ofSeconds(1));
    }
}
