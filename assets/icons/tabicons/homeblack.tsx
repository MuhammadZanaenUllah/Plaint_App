import * as React from "react"
import Svg, { Path } from "react-native-svg"

function HomeIconBlack(props: any) {
  return (
    <Svg
      xmlns="http://www.w3.org/2000/svg"
      width={21}
      height={21}
      viewBox="0 0 21 21"
      fill="none"
      {...props}
    >
      <Path
        d="M1.789 6.19l6.758-4.9a3 3 0 013.545.016l6.245 4.618a3 3 0 011.217 2.412v8.746a3 3 0 01-3 3H3.55a3 3 0 01-3-3V8.62a3 3 0 011.239-2.428z"
        stroke="#000"
        strokeWidth={1.1}
      />
      <Path
        d="M7.166 16.655h5.864"
        stroke="#000"
        strokeWidth={1.1}
        strokeLinecap="round"
      />
    </Svg>
  )
}

export default HomeIconBlack
