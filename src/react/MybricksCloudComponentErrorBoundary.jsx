import React from "react";
import { style } from "./MybricksCloudComponentConst";

export default class ErrorBoundary extends React.Component {

  constructor(props) {
    super(props);
    this.state = {error: null, errorInfo: null};
  }

  componentDidCatch(error, errorInfo) {
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
  }

  render() {
    if (this.state.error) {
      return (
        <div style={style}>
          <div>组件 (namespace = {this.props.namespace}, version = {this.props.version}）发生错误.</div>
          <div>{this.state.error.toString()}</div>
        </div>
      );
    }

    return this.props.children;
  }
}
