#!/usr/bin/env node

/**
 * Clean Startup Script
 * Suppresses Redis connection errors and deprecation warnings
 */

process.env.NODE_NO_WARNINGS = '1';

// Suppress specific deprecation warnings
const originalEmitWarning = process.emitWarning;
process.emitWarning = function (warning, type, code, ...args) {
  // Suppress url.parse() deprecation
  if (code === 'DEP0169') return;
  
  // Suppress other known non-critical warnings
  if (typeof warning === 'string' && warning.includes('url.parse()')) return;
  
  return originalEmitWarning.call(this, warning, type, code, ...args);
};

// Suppress unhandled rejection warnings for Redis
process.on('unhandledRejection', (reason, promise) => {
  if (reason && typeof reason === 'object') {
    // Suppress Redis connection errors
    if (reason.code === 'ECONNREFUSED' || reason.code === 'ENOTFOUND') {
      console.warn('⚠️  Redis unavailable - running without caching');
      return;
    }
  }
  
  // Log other unhandled rejections
  console.error('Unhandled Rejection:', reason);
});

// Start Next.js
require('next/dist/bin/next');
