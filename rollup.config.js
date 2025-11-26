import pkg from './package.json';
import { babel } from '@rollup/plugin-babel';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import replace from '@rollup/plugin-replace';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';

const name = 'uploader';
const NAME = name.charAt(0).toUpperCase() + name.substr(1);

const banner = `/*!
 * ${NAME} - ${pkg.description}
 * @version v${pkg.version}
 * @author ${pkg.author}
 * @link ${pkg.homepage}
 * @license ${pkg.license}
 */`;

export default [
  // UMD build (unminified)
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/uploader.js',
      format: 'umd',
      name: 'Uploader',
      banner
    },
    plugins: [
      replace({
        preventAssignment: true,
        '__VERSION__': pkg.version
      }),
      typescript({
        tsconfig: './tsconfig.json',
        outputToFilesystem: true,
      }),
      nodeResolve(),
      commonjs(),
      babel({
        babelHelpers: 'bundled',
        extensions: ['.js', '.ts'],
        presets: [['@babel/preset-env', { targets: { ie: '10' } }]]
      })
    ]
  },
  // UMD build (minified)
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/uploader.min.js',
      format: 'umd',
      name: 'Uploader',
      banner,
      sourcemap: true
    },
    plugins: [
      replace({
        preventAssignment: true,
        '__VERSION__': pkg.version
      }),
      typescript({
        tsconfig: './tsconfig.json',
        outputToFilesystem: true,
      }),
      nodeResolve(),
      commonjs(),
      babel({
        babelHelpers: 'bundled',
        extensions: ['.js', '.ts'],
        presets: [['@babel/preset-env', { targets: { ie: '10' } }]]
      }),
      terser({
        output: {
          comments: /^!/
        }
      })
    ]
  },
  // ESM build
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/uploader.esm.js',
      format: 'esm',
      banner
    },
    plugins: [
      replace({
        preventAssignment: true,
        '__VERSION__': pkg.version
      }),
      typescript({
        tsconfig: './tsconfig.json',
        outputToFilesystem: true,
      }),
      nodeResolve(),
      commonjs()
    ]
  }
];

