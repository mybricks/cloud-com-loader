const path = require("path");
const portFinderSync = require("portfinder-sync");

const port = portFinderSync.getPort(8000);

module.exports = {
  mode: 'development',
  entry: "./public/app.jsx",
  output: {
    filename: "bundle.js"
  },
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
  },
  stats: {
    colors: true,
  },
  module: {
    rules: [
      {
        test: /\.jsx?$/,
        use: [
          {
            loader: 'babel-loader',
            options: {
              presets: ['@babel/preset-env', '@babel/preset-react'],
              cacheDirectory: true,
            },
          },
          // npm run dev，取消注释，填入相应的配置项
          // {
          //   loader: path.resolve(__dirname, "../src/loader.js"),
          //   options: {
          //     configs: [
          //       {
          //         tagName: "xxx",
          //         defKeyword: "xxx",
          //         api: "xxx"
          //       },
          //       {
          //         tagName: "xxx2",
          //         defKeyword: "xxx2",
          //         api: "xxx2"
          //       }
          //     ]
          //   }
          // }
        ],
        exclude: "/node_modules/"
      }
    ]
  },
  devServer: {
    open: false,
    port,
    host: '0.0.0.0',
    static: {
      directory: './public'
    }
  },
  externals: [{
    'react': 'React',
    'react-dom': 'ReactDOM'
  }]
};
