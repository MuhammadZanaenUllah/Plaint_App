import * as React from "react"
import Svg, { Rect, Path } from "react-native-svg"

function TaskIconBlack(props: any) {
  return (
    <Svg
      xmlns="http://www.w3.org/2000/svg"
      width={18}
      height={18}
      viewBox="0 0 18 18"
      fill="none"
      {...props}
    >
      <Rect
        x={0.55}
        y={0.55}
        width={16.6674}
        height={16.6674}
        rx={4.45}
        stroke="#000"
        strokeWidth={1.1}
      />
      <Path
        d="M3.088 6.262l.959.907 1.821-2.14M3.088 12.01l.959.907 1.821-2.14M8.138 6.258h5.387M8.138 11.891h5.387"
        stroke="#000"
        strokeWidth={1.1}
        strokeLinecap="round"
      />
    </Svg>
  )
}

export default TaskIconBlack
