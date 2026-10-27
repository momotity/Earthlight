/**
 * ESLint 扁平配置（ESLint 9）
 *
 * 目标不是把代码改成另一种风格，而是拦住真正会出事的写法：
 * 未定义变量、漏掉的 await、误用 var、调试残留。
 */
import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'tools/raw/**', 'preview-*.png']
  },

  js.configs.recommended,

  {
    files: ['src/**/*.js', 'tests/**/*.js', 'vite.config.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    rules: {
      // 明确忽略以下划线开头的占位参数，其余未使用一律提示
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'none'
      }],
      // 空 catch 在这里是刻意的降级处理（setPointerCapture 等）
      'no-empty': ['warn', { allowEmptyCatch: true }],
      eqeqeq: ['warn', 'smart'],
      'prefer-const': 'warn',
      'no-var': 'error',
      // 允许 console 用于调试与错误上报
      'no-console': 'off',
      // GLSL 里大量出现位运算与短变量名，不做过严限制
      'no-bitwise': 'off'
    }
  },

  {
    // 自动生成的数据文件：几万个数字，不参与风格检查
    files: ['src/data/**/*.js'],
    rules: {
      'no-unused-vars': 'off',
      'no-undef': 'off',
      'max-len': 'off'
    }
  }
];
