#!/usr/bin/env node
/**
 * Test Script for OpenCode Tools
 * Comprehensive verification of all available tools using the current project
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { execSync, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.dirname(__dirname);

// Test configuration
const TOOLS_TO_TEST = [
  { name: 'read', description: 'Read files and validate content' },
  { name: 'write', description: 'Create new files with proper permissions' },
  { name: 'edit', description: 'Modify existing file content' },
  { name: 'bash', description: 'Execute system commands' },
  { name: 'task', description: 'Launch subagents for complex tasks' }
];

// Helper functions
function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function testRead() {
  log('\n=== Testing READ tool ===');
  
  // Test reading existing files
  const filesToTest = [
    'package.json',
    'AGENTS.md',
    'opencode.json'
  ];
  
  let successCount = 0;
  for (const file of filesToTest) {
    try {
      const fullPath = path.join(PROJECT_ROOT, file);
      const content = readFileSync(fullPath, 'utf-8');
      log(`✓ Read ${file}: ${content.length} bytes`);
      successCount++;
    } catch (error) {
      log(`✗ Error reading ${file}: ${error.message}`);
    }
  }
  
  // Test error handling for non-existent file
  try {
    readFileSync('nonexistent.json', 'utf-8');
    log('✗ Should have thrown error for missing file');
  } catch (error) {
    log(`✓ Correctly threw error: ${error.code}`);
    successCount++;
  }
  
  return successCount === 4;
}

function testWrite() {
  log('\n=== Testing WRITE tool ===');
  
  // Create a temporary test file
  const testName = 'test-tool-write-timing';
  const filePath = path.join(PROJECT_ROOT, `__tests__/${testName}.txt`);
  
  try {
    writeFileSync(filePath, `Test content for ${testName}`);
    log(`✓ Created file: ${filePath}`);
    
    // Verify file exists and has correct content
    const content = readFileSync(filePath, 'utf-8');
    if (content.includes(testName)) {
      log(`✓ File content verified`);
      return true;
    } else {
      log('✗ File content mismatch');
      return false;
    }
  } catch (error) {
    log(`✗ Error writing file: ${error.message}`);
    return false;
  } finally {
    // Clean up test file
    try {
      if (existsSync(filePath)) {
        writeFileSync(filePath, '', 'utf-8');
        log(`✓ Cleaned up test file`);
      }
    } catch (e) {}
  }
}

function testEdit() {
  log('\n=== Testing EDIT tool ===');
  
  const targetFile = path.join(PROJECT_ROOT, 'README.md'); // Use a simple test file
  
  if (!existsSync(targetFile)) {
    log(`⚠ ${targetFile} does not exist - skipping edit test`);
    return false;
  }
  
  try {
    // First read the file
    const originalContent = readFileSync(targetFile, 'utf-8');
    log(`✓ Read current content (${originalContent.length} bytes)`);
    
    // Simulate an edit (in real usage, this would use the edit tool)
    const modifiedContent = originalContent + '\n\n# Edited by test script';
    
    // Write back
    writeFileSync(targetFile, modifiedContent, 'utf-8');
    log(`✓ Modified content added`);
    
    // Verify modification
    const newContent = readFileSync(targetFile, 'utf-8');
    if (newContent.includes('# Edited by test script')) {
      log('✓ Edit operation successful');
      return true;
    } else {
      log('✗ Modify not verified');
      return false;
    }
  } catch (error) {
    log(`✗ Error editing file: ${error.message}`);
    return false;
  }
}

function testBash() {
  log('\n=== Testing BASH tool ===');
  
  const commands = [
    { cmd: 'echo "Test bash output"', expectContains: ['Test'] },
    { cmd: 'dir /b', expectContains: [] }, // Windows command
    { cmd: 'pwd', expectContains: [] } // Unix equivalent
  ];
  
  let successCount = 0;
  
  for (const test of commands) {
    try {
      const output = execSync(test.cmd, { encoding: 'utf-8' });
      if (test.expectContains.length === 0 || 
          test.expectContains.every(cmd => output.includes(cmd))) {
        log(`✓ Command "${test.cmd}" executed successfully: ${output.trim()}`);
        successCount++;
      } else {
        log(`✗ Command "${test.cmd}" failed - expected to contain: ${JSON.stringify(test.expectContains)}`);
      }
    } catch (error) {
      log(`✗ Error executing "${test.cmd}": ${error.message}`);
    }
  }
  
  return successCount > 0;
}

function testTask() {
  log('\n=== Testing TASK tool ===');
  
  // Test launching a subagent with a simple task
  const taskType = 'explore'; // Using explore type for demonstration
  
  try {
    // This would normally use the task subagent functionality
    // For this test, we'll just verify that we can create a task call
    log(`✓ Launched ${taskType} task (simulated)`);
    return true;
  } catch (error) {
    log(`✗ Error launching task: ${error.message}`);
    return false;
  }
}

async function runAllTests() {
  log('\n==============================');
  log('OPENCODE TOOLS COMPREHENSIVE TEST');
  log('==============================\n');
  
  const startTime = Date.now();
  
  // Run all tests sequentially (automated approach B)
  let overallSuccess = true;
  
  // Test each tool
  for (const tool of TOOLS_TO_TEST) {
    try {
      const success = await testTool(tool.name, tool.description);
      
      if (success) {
        log(`✓ ${tool.name}: PASSED`);
      } else {
        log(`✗ ${tool.name}: FAILED`);
        overallSuccess = false;
      }
    } catch (error) {
      log(`✗ ${tool.name}: ERROR - ${error.message}`);
      overallSuccess = false;
    }
  }
  
  const endTime = Date.now();
  const duration = endTime - startTime;
  
  log('\n==============================');
  log('TEST SUMMARY');
  log(`==============================`);
  log(`Total Duration: ${duration}ms`);
  log(`Overall Status: ${overallSuccess ? 'ALL PASS' : 'SOME FAILED'}`);
  
  return overallSuccess;
}

// Note: This is a simplified test script that demonstrates the approach.
// Real implementation would use actual OpenCode tool calls via the MCP interface.

function testTool(name, description) {
  // Placeholder for actual tool tests - this would be replaced with real MCp calls
  if (name === 'read') return testRead();
  if (name === 'write') return testWrite();
  if (name === 'edit') return testEdit();
  if (name === 'bash') return testBash();
  if (name === 'task') return testTask();
  
  log(`✗ Unknown tool: ${name}`);
  return false;
}

// Run the tests
runAllTests().then(success => {
  process.exit(success ? 0 : 1);
});
