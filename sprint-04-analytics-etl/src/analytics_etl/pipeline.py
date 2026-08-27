"""
pipeline.py
"""

from __future__ import annotations

import logging
import sys


from .extract import (
    QuotaExceededError,
    SymbolRequestError,
    check_health,
    check_usage,
    extract,
)

from .load import load
from .transform import transform


logger = logging.getLogger(__name__)


SYMBOLS = ["SUNPHARMA.NS", "HDFCBANK.NS", "EICHERMOT.NS"]


START_DATE = "2025-08-27"
END_DATE = "2026-08-27"



def run_pipeline(
    symbols: list[str] = SYMBOLS,
    start: str = START_DATE,
    end: str = END_DATE
):


    if not check_health():

        logger.error(
            "HEALTH_CHECK_FAILED"
        )

        sys.exit(1)



    for symbol in symbols:


        try:

            raw = extract(
                symbol,
                start,
                end
            )


        except QuotaExceededError as exc:


            logger.error(
                "PIPELINE_STOPPED reason=%s",
                exc
            )


            try:

                usage = check_usage()

                logger.info(
                    "USAGE=%s",
                    usage
                )


            except Exception as usage_exc:

                logger.error(
                    "USAGE_CHECK_FAILED reason=%s",
                    usage_exc
                )


            sys.exit(1)



        except SymbolRequestError as exc:


            logger.error(
                "SYMBOL_SKIPPED symbol=%s reason=%s",
                symbol,
                exc
            )

            continue



        except ConnectionError as exc:


            logger.error(
                "NETWORK_FAILED symbol=%s reason=%s",
                symbol,
                exc
            )

            continue



        clean_df = transform(raw)


        if clean_df.empty:


            logger.warning(
                "BAD_PAYLOAD symbol=%s action=drop",
                symbol
            )

            continue



        load(clean_df)


        logger.info(
            "LOADED symbol=%s rows=%s",
            symbol,
            len(clean_df)
        )



    logger.info(
        "PIPELINE_COMPLETE"
    )