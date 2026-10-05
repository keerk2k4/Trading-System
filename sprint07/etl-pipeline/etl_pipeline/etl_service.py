import logging
import uuid
from datetime import datetime, timedelta
from decimal import Decimal
from .database import PostgreSQLConnection
from .warehouse import DuckDBWarehouse

logger = logging.getLogger(__name__)

class ETLService:
    def __init__(self):
        self.pg_conn = PostgreSQLConnection()
        self.warehouse = DuckDBWarehouse()
    
    def connect(self):
        """Initialize connections"""
        if not self.pg_conn.connect():
            return False
        if not self.warehouse.connect():
            return False
        return True
    
    def close(self):
        """Close all connections"""
        self.pg_conn.close()
        self.warehouse.close()
    
    def run_etl(self):
        """Execute ETL pipeline"""
        batch_id = f"BATCH_{int(datetime.now().timestamp() * 1000)}_{uuid.uuid4().hex[:8]}"
        logger.info(f"Starting ETL batch: {batch_id}")
        
        try:
            # Get watermark
            watermark = self.warehouse.get_watermark()
            logger.info(f"Watermark: {watermark}")
            
            # Fetch orders
            orders = self.pg_conn.fetch_orders(watermark)
            logger.info(f"Fetched {len(orders)} orders")
            
            if not orders:
                logger.info("No new orders to process")
                self.warehouse.insert_batch_summary(batch_id, 0, 0, 0, "SUCCESS")
                return {'batch_id': batch_id, 'total_records': 0, 'loaded': 0, 'rejected': 0}
            
            # Process orders
            loaded = 0
            rejected = 0
            max_watermark = watermark
            
            for order in orders:
                # Validation
                errors = self.validate_order(order)
                
                if errors:
                    # Dead-letter
                    self.warehouse.insert_dead_letter(
                        order['order_id'], order['account_id'], order['instrument_id'],
                        order['side'], order['quantity'], order['price'],
                        order['status'], order['created_at'],
                        '; '.join(errors), batch_id
                    )
                    rejected += 1
                    logger.warning(f"Rejected order {order['order_id']}: {errors}")
                else:
                    # Load dimensions
                    self.load_dimensions(order)
                    
                    # Load fact
                    if self.load_fact_trade(order, batch_id):
                        loaded += 1
                        max_watermark = order['created_at']
            
            # Update watermark
            self.warehouse.update_watermark(max_watermark, batch_id)
            
            # Summary
            self.warehouse.insert_batch_summary(
                batch_id, len(orders), loaded, rejected, "SUCCESS"
            )
            
            logger.info(f"Batch complete: {loaded} loaded, {rejected} rejected")
            return {
                'batch_id': batch_id,
                'total_records': len(orders),
                'loaded': loaded,
                'rejected': rejected
            }
        
        except Exception as e:
            logger.error(f"ETL failed: {e}", exc_info=True)
            self.warehouse.insert_batch_summary(batch_id, 0, 0, 0, "FAILED", str(e))
            raise
    
    def validate_order(self, order):
        """Validate order data quality"""
        errors = []
        
        # Check quantity
        if not order['quantity'] or order['quantity'] <= 0:
            errors.append(f"Quantity must be positive, got: {order['quantity']}")
        
        # Check price
        if not order['price'] or order['price'] <= 0:
            errors.append(f"Price must be positive, got: {order['price']}")
        
        # Check side
        if order['side'] not in ('BUY', 'SELL'):
            errors.append(f"Side must be BUY or SELL, got: {order['side']}")
        
        # Check status
        valid_statuses = {'PENDING', 'FILLED', 'CANCELLED', 'REJECTED', 'EXPIRED'}
        if order['status'] not in valid_statuses:
            errors.append(f"Status must be one of {valid_statuses}, got: {order['status']}")
        
        return errors
    
    def load_dimensions(self, order):
        """Load/create dimension records"""
        # Date dimension
        created_date = order['created_at'].date()
        date_key = int(created_date.strftime('%Y%m%d'))
        self.warehouse.insert_dimension_data('dim_date', {
            'date_key': date_key,
            'full_date': created_date,
            'year': created_date.year,
            'month': created_date.month,
            'day': created_date.day,
            'quarter': (created_date.month - 1) // 3 + 1,
            'week_of_year': created_date.isocalendar()[1],
            'day_of_week': created_date.weekday(),
            'day_name': created_date.strftime('%A'),
            'month_name': created_date.strftime('%B'),
            'is_weekend': created_date.weekday() >= 5
        })
        
        # Instrument dimension
        instrument = self.pg_conn.fetch_instrument(order['instrument_id'])
        if instrument:
            self.warehouse.insert_dimension_data('dim_instrument', {
                'instrument_id': instrument['instrument_id'],
                'ticker_symbol': instrument.get('ticker_symbol'),
                'instrument_name': instrument.get('name'),
                'instrument_status': instrument.get('status')
            })
        
        # Account dimension
        account = self.pg_conn.fetch_account(order['account_id'])
        if account:
            self.warehouse.insert_dimension_data('dim_account', {
                'account_id': account['account_id'],
                'account_num': account.get('account_number'),
                'user_id': account.get('user_id'),
                'account_status': account.get('status')
            })
    
    def load_fact_trade(self, order, batch_id):
        """Load trade fact"""
        try:
            date_key = int(order['created_at'].date().strftime('%Y%m%d'))
            trade_value = order['quantity'] * order['price']
            
            self.warehouse.insert_fact_trade({
                'order_id': order['order_id'],
                'date_key': date_key,
                'instrument_key': order['instrument_id'],
                'account_key': order['account_id'],
                'side': order['side'],
                'quantity': order['quantity'],
                'price': order['price'],
                'trade_value': trade_value,
                'order_status': order['status'],
                'created_date_key': date_key,
                'batch_id': batch_id
            })
            return True
        except Exception as e:
            logger.error(f"Failed to load fact trade: {e}")
            return False
