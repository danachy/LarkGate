// Test SSE connection with detailed logging
import { EventSource } from 'eventsource';

console.log('🔍 Testing SSE Connection to LarkGate...');

const eventSource = new EventSource('http://localhost:3000/sse');

eventSource.onopen = function(event) {
    console.log('✅ SSE connection opened:', event);
    console.log('   - ReadyState:', eventSource.readyState);
    console.log('   - URL:', eventSource.url);
};

eventSource.onmessage = function(event) {
    console.log('📨 Message received:', event.data);
    try {
        const data = JSON.parse(event.data);
        console.log('   - Type:', data.type);
        console.log('   - Data:', JSON.stringify(data.data, null, 2));
    } catch (error) {
        console.log('   - Raw data:', event.data);
    }
};

eventSource.onerror = function(error) {
    console.error('❌ SSE error:', error);
    console.error('   - ReadyState:', eventSource.readyState);
    console.error('   - Type:', error.type);
    console.error('   - Message:', error.message);
    
    if (eventSource.readyState === EventSource.CLOSED) {
        console.log('🔄 Connection closed, attempting to reconnect...');
    }
};

// Test timeout
setTimeout(() => {
    console.log('⏰ Test timeout reached, closing connection...');
    eventSource.close();
    process.exit(0);
}, 10000);

// Handle process termination
process.on('SIGINT', () => {
    console.log('\n👋 Closing SSE connection...');
    eventSource.close();
    process.exit(0);
});