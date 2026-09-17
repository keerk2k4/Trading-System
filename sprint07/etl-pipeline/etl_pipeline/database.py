import psycopg
from psycopg.rows import dict_row
import logging
from .config import POSTGRES_URL

logger = logging.getLogger(__name__)

class PostgreSQLConnection:
    def __init__(self):
        self.conn = None
    
    def connect(self):
        """Connect to PostgreSQL"""
        try:
            self.conn = psycopg.connect(POSTGRES_URL)
            logger.info("Connected to PostgreSQL")
            return True
        except Exception as e:
            logger.error(f"Failed to connect to PostgreSQL: {e}")
            return False
    
    def close(self):
        """Close connection"""
        if self.conn:
            self.conn.close()
            logger.info("Disconnected from PostgreSQL")
    
    def execute_query(self, query, params=None):
        """Execute SELECT query and return results as dicts"""
        try:
            with self.conn.cursor(row_factory=dict_row) as cur:
                cur.execute(query, params or ())
                return cur.fetchall()
        except Exception as e:
            logger.error(f"Query execution error: {e}")
            return []
    
    def fetch_orders(self, watermark_timestamp):
        """Fetch orders created after watermark"""
        query = """
            SELECT order_id, account_id, instrument_id, action as side, type, status,
                   price, quantity, created_at
            FROM orders
            WHERE created_at > %s
            ORDER BY created_at ASC
            LIMIT %s
        """
        from config import BATCH_SIZE
        return self.execute_query(query, (watermark_timestamp, BATCH_SIZE))
    
    def fetch_account(self, account_id):
        """Fetch account details"""
        query = "SELECT * FROM accounts WHERE account_id = %s"
        results = self.execute_query(query, (account_id,))
        return results[0] if results else None
    
    def fetch_instrument(self, instrument_id):
        """Fetch instrument details"""
        query = "SELECT * FROM instruments WHERE instrument_id = %s"
        results = self.execute_query(query, (instrument_id,))
        return results[0] if results else None
