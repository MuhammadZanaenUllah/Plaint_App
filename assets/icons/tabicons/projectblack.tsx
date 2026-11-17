import * as React from "react"
import Svg, { Path } from "react-native-svg"

// Projects = folders that group channels; same line style as the task/chat tab icons.
function ProjectIconBlack(props: any) {
  return (
    <Svg
      xmlns="http://www.w3.org/2000/svg"
      width={18}
      height={18}
      viewBox="0 0 18 18"
      fill="none"
      {...props}
    >
      <Path
        d="M1.15 4.4c0-1.1.9-2 2-2h3.17c.5 0 .98.2 1.34.56L8.9 4.2h5.95c1.1 0 2 .9 2 2v7.4c0 1.1-.9 2-2 2H3.15c-1.1 0-2-.9-2-2V4.4z"
        stroke="#000"
        strokeWidth={1.1}
        strokeLinejoin="round"
      />
      <Path
        d="M4.7 8.75h8.6M4.7 11.85h5.1"
        stroke="#000"
        strokeWidth={1.1}
        strokeLinecap="round"
      />
    </Svg>
  )
}

export default ProjectIconBlack
