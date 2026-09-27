import React from "react";
import Typewriter from "typewriter-effect";
import profile from "../../portfolio.config";

function Type() {
  return (
    <Typewriter
      options={{
        strings: profile.typewriter,
        autoStart: true,
        loop: true,
        deleteSpeed: 50,
      }}
    />
  );
}

export default Type;
