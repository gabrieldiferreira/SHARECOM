from flask import Blueprint, jsonify, request
from datetime import datetime
import psutil
import os

health_bp = Blueprint('health', __name__)

MEMORY_THRESHOLD_MB = 512

def get_memory_usage_mb():
    process = psutil.Process(os.getpid())
    return process.memory_info().rss / 1024 / 1024

def check_database():
    try:
        from database import get_db_connection
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT 1')
        cursor.close()
        conn.close()
        return True, None
    except Exception as e:
        return False, str(e)

def check_redis():
    try:
        import redis
        from main import app
        redis_url = app.config.get('REDIS_URL')
        if not redis_url:
            return None, 'REDIS_URL not configured'
        r = redis.from_url(redis_url)
        r.ping()
        return True, None
    except Exception as e:
        return False, str(e)

@health_bp.route('/api/health', methods=['GET'])
def health_check():
    start_time = datetime.utcnow()
    
    db_status, db_error = check_database()
    redis_status, redis_error = check_redis()
    memory_mb = get_memory_usage_mb()
    memory_healthy = memory_mb < MEMORY_THRESHOLD_MB
    
    healthy = (
        db_status == True and 
        (redis_status == True or redis_status is None) and 
        memory_healthy
    )
    
    response = {
        'status': 'healthy' if healthy else 'unhealthy',
        'timestamp': start_time.isoformat(),
        'checks': {
            'database': {
                'status': 'up' if db_status else 'down',
                'error': db_error,
            },
            'redis': {
                'status': 'up' if redis_status else ('not_configured' if redis_status is None else 'down'),
                'error': redis_error,
            },
            'memory': {
                'status': 'ok' if memory_healthy else 'high',
                'usage_mb': round(memory_mb, 2),
                'threshold_mb': MEMORY_THRESHOLD_MB,
            },
        },
        'metrics': {
            'queries_per_request_avg': 0,
            'memory_trend': 'stable',
            'error_rate': 0,
        },
    }
    
    status_code = 200 if healthy else 503
    return jsonify(response), status_code

@health_bp.route('/api/health/ready', methods=['GET'])
def readiness_check():
    db_status, _ = check_database()
    if not db_status:
        return jsonify({'ready': False, 'reason': 'database not ready'}), 503
    return jsonify({'ready': True}), 200

@health_bp.route('/api/health/live', methods=['GET'])
def liveness_check():
    return jsonify({'alive': True}), 200