package com.tradeexecutor.kafka;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public class EventEnvelope<T> {

    private String eventId;
    private String eventType;
    private String eventTime;
    private String source;
    private Integer schemaVersion;
    private T payload;

    public EventEnvelope() {
    }

    public String getEventId() { return eventId; }
    public void setEventId(String eventId) { this.eventId = eventId; }

    public String getEventType() { return eventType; }
    public void setEventType(String eventType) { this.eventType = eventType; }

    public String getEventTime() { return eventTime; }
    public void setEventTime(String eventTime) { this.eventTime = eventTime; }

    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }

    public Integer getSchemaVersion() { return schemaVersion; }
    public void setSchemaVersion(Integer schemaVersion) { this.schemaVersion = schemaVersion; }

    public T getPayload() { return payload; }
    public void setPayload(T payload) { this.payload = payload; }
}