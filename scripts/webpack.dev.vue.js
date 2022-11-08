const path = require("path");
const portFinderSync = require("portfinder-sync");
const { VueLoaderPlugin } = require("vue-loader");

const port = portFinderSync.getPort(8000);

module.exports = {
  mode: 'development',
  entry: "./public/vue/index.js",
  output: {
    filename: "bundle.js"
  },
  resolve: {
    extensions: ['.js', '.vue', '.ts'],
  },
  stats: {
    colors: true,
  },
  module: {
    rules: [
      {
        test: /\.vue/,
        use: [
          {
            loader: 'vue-loader',
            options: {
              hotReload: false
            }
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
          //     ],
          //     type: "vue"
          //   }
          // }
        ],
        exclude: /node_modules/
      }
    ]
  },
  plugins: [
    new VueLoaderPlugin()
  ],
  devServer: {
    open: false,
    port,
    host: "0.0.0.0",
    static: {
      directory: "./public"
    }
  },
  externals: [{
    'vue': "Vue",
    'react': 'React',
    'react-dom': 'ReactDOM'
  }]
};
