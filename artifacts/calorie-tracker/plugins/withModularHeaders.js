// Fixes: "The Swift pod `AppCheckCore` depends upon `GoogleUtilities` and
// `RecaptchaInterop`, which do not define modules."
// Cause: @clerk/expo installs ClerkGoogleSignIn -> AppCheckCore (Swift pod)
//        which needs GoogleUtilities/RecaptchaInterop to expose module maps.
const { withDangerousMod } = require("@expo/config-plugins");
const path = require("path");
const fs = require("fs");

module.exports = function withModularHeaders(config) {
  return withDangerousMod(config, [
    "ios",
    function (config) {
      const podfilePath = path.join(
        config.modRequest.platformProjectRoot,
        "Podfile"
      );
      if (!fs.existsSync(podfilePath)) return config;

      let podfile = fs.readFileSync(podfilePath, "utf8");

      if (!podfile.includes("pod 'GoogleUtilities', :modular_headers => true")) {
        podfile = podfile.replace(
          "use_expo_modules!",
          [
            "use_expo_modules!",
            "  pod 'GoogleUtilities', :modular_headers => true",
            "  pod 'RecaptchaInterop', :modular_headers => true",
          ].join("\n")
        );
        fs.writeFileSync(podfilePath, podfile);
      }

      return config;
    },
  ]);
};
