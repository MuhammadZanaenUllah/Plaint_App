import * as React from "react"
import Svg, { Path } from "react-native-svg"

function ChatIconWhite(props: any) {
  return (
    <Svg
      xmlns="http://www.w3.org/2000/svg"
      width={19}
      height={19}
      viewBox="0 0 19 19"
      fill="none"
      {...props}
    >
      <Path
        d="M9.358.55a8.81 8.81 0 010 17.618H.55v-8.81A8.81 8.81 0 019.358.55z"
        stroke="#fff"
        strokeWidth={1.1}
      />
      <Path
        d="M4.811 7.607h8.986M4.811 11.083h5.171"
        stroke="#fff"
        strokeWidth={1.1}
        strokeLinecap="round"
      />
    </Svg>
  )
}

export default ChatIconWhite
