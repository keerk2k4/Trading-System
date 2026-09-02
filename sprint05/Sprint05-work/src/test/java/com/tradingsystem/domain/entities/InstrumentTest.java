package com.tradingsystem.domain.entities;

import com.tradingsystem.domain.enums.AssetClass;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class InstrumentTest {


    @Test
    void shouldCreateInstrumentWithRequiredDetails() {

        Instrument instrument = createInstrument();

        assertEquals(
                "FAUX:TCS",
                instrument.getSymbol()
        );

        assertEquals(
                "Tata Consultancy Services",
                instrument.getDisplayName()
        );

        assertEquals(
                AssetClass.EQUITY,
                instrument.getAssetClass()
        );

        assertEquals(
                "INR",
                instrument.getQuotationCurrency()
        );
    }


    @Test
    void newlyCreatedInstrumentShouldBeTradable() {

        Instrument instrument = createInstrument();

        assertTrue(
                instrument.mayBeTraded()
        );
    }


    @Test
    void delistedInstrumentShouldNotBeTradable() {

        Instrument instrument = createInstrument();

        instrument.delist();

        assertFalse(
                instrument.mayBeTraded()
        );
    }


    @Test
    void delistingShouldNotRemoveInstrumentDetails() {

        Instrument instrument = createInstrument();

        instrument.delist();

        assertEquals(
                "FAUX:TCS",
                instrument.getSymbol()
        );

        assertEquals(
                "Tata Consultancy Services",
                instrument.getDisplayName()
        );
    }


    @Test
    void instrumentShouldRemainDelisted() {

        Instrument instrument = createInstrument();

        instrument.delist();

        assertFalse(instrument.mayBeTraded());
        assertFalse(instrument.mayBeTraded());
    }

    @Test
    void shouldRejectBlankSymbol() {
        assertThrows(
                IllegalArgumentException.class,
                () -> new Instrument(
                        "",
                        "Tata Consultancy Services",
                        AssetClass.EQUITY,
                        "INR"
                )
        );
    }

    @Test
    void shouldRejectBlankDisplayName() {
        assertThrows(
                IllegalArgumentException.class,
                () -> new Instrument(
                        "TCS",
                        "",
                        AssetClass.EQUITY,
                        "INR"
                )
        );
    }

    @Test
    void shouldRejectNullAssetClass() {
        assertThrows(
                IllegalArgumentException.class,
                () -> new Instrument(
                        "TCS",
                        "Tata Consultancy Services",
                        null,
                        "INR"
                )
        );
    }

    @Test
    void shouldRejectBlankQuotationCurrency() {
        assertThrows(
                IllegalArgumentException.class,
                () -> new Instrument(
                        "TCS",
                        "Tata Consultancy Services",
                        AssetClass.EQUITY,
                        ""
                )
        );
    }

    @Test
    void shouldInitiallyBeTradable() {
        Instrument instrument = new Instrument(
                "TCS",
                "Tata Consultancy Services",
                AssetClass.EQUITY,
                "INR"
        );

        assertTrue(instrument.mayBeTraded());
    }

    @Test
    void shouldNotBeTradableAfterDelisting() {
        Instrument instrument = new Instrument(
                "TCS",
                "Tata Consultancy Services",
                AssetClass.EQUITY,
                "INR"
        );

        instrument.delist();

        assertFalse(instrument.mayBeTraded());
    }

    @Test
    void delistingShouldBeIrreversible() {
        Instrument instrument = new Instrument(
                "TCS",
                "Tata Consultancy Services",
                AssetClass.EQUITY,
                "INR"
        );

        instrument.delist();
        instrument.delist();

        assertFalse(instrument.mayBeTraded());
    }


    private Instrument createInstrument() {

        return new Instrument(
                "FAUX:TCS",
                "Tata Consultancy Services",
                AssetClass.EQUITY,
                "INR"
        );
    }
}
