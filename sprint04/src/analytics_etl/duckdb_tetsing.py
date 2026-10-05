import duckdb

conn=duckdb.connect(database='analytics.duckdb', read_only=False)
conn.sql("Select * from candles").show()