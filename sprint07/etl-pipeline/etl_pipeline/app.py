#!/usr/bin/env python3
import logging
import sys
from .etl_service import ETLService
from .config import LOG_LEVEL

# Setup logging
logging.basicConfig(
    level=LOG_LEVEL,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def main():
    """Run ETL pipeline"""
    etl = ETLService()
    
    try:
        if not etl.connect():
            logger.error("Failed to connect to databases")
            sys.exit(1)
        
        result = etl.run_etl()
        
        logger.info(f"ETL Result: {result}")
        print(f"\n✓ ETL Complete")
        print(f"  Batch ID: {result['batch_id']}")
        print(f"  Total Records: {result['total_records']}")
        print(f"  Loaded: {result['loaded']}")
        print(f"  Rejected: {result['rejected']}")
        
    except Exception as e:
        logger.error(f"ETL Pipeline failed: {e}", exc_info=True)
        sys.exit(1)
    finally:
        etl.close()

if __name__ == '__main__':
    main()
