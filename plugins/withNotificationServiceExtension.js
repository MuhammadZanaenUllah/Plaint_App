// Adds the iOS Notification Service Extension that turns chat pushes into one
// "N new messages" notification per conversation. Source files live in
// ./notification-service and are copied into ios/ at prebuild (ios/ is not committed).
/* global __dirname */
const fs = require("fs");
const path = require("path");
const { withDangerousMod, withXcodeProject } = require("expo/config-plugins");

const TARGET = "PlanitNotificationService";
const SRC_DIR = path.join(__dirname, "notification-service");
const SWIFT = "NotificationService.swift";
const PLIST = `${TARGET}-Info.plist`; // name the xcode lib's addTarget expects

const withFiles = (config) =>
  withDangerousMod(config, [
    "ios",
    (cfg) => {
      const dest = path.join(cfg.modRequest.platformProjectRoot, TARGET);
      fs.mkdirSync(dest, { recursive: true });
      fs.copyFileSync(path.join(SRC_DIR, SWIFT), path.join(dest, SWIFT));
      // Extension versions must match the app's (EAS remote versioning
      // overwrites both at build time).
      const plist = fs
        .readFileSync(path.join(SRC_DIR, "Info.plist"), "utf8")
        .replace("__VERSION__", cfg.version ?? "1.0.0")
        .replace("__BUILD_NUMBER__", cfg.ios?.buildNumber ?? "1");
      fs.writeFileSync(path.join(dest, PLIST), plist);
      return cfg;
    },
  ]);

const withTarget = (config) =>
  withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    if (project.pbxTargetByName(TARGET)) return cfg;

    const objects = project.hash.project.objects;
    objects.PBXTargetDependency = objects.PBXTargetDependency || {};
    objects.PBXContainerItemProxy = objects.PBXContainerItemProxy || {};

    const group = project.addPbxGroup([SWIFT, PLIST], TARGET, TARGET);
    project.addToPbxGroup(group.uuid, project.getFirstProject().firstProject.mainGroup);

    // Read the app's deployment target before the new target's configs exist.
    const appDeploymentTarget =
      Object.values(project.pbxXCBuildConfigurationSection()).find(
        (c) => c?.buildSettings?.PRODUCT_BUNDLE_IDENTIFIER && c.buildSettings.IPHONEOS_DEPLOYMENT_TARGET,
      )?.buildSettings.IPHONEOS_DEPLOYMENT_TARGET ?? "16.4";

    // Embeds the .appex in the app and adds the target dependency.
    const target = project.addTarget(
      TARGET,
      "app_extension",
      TARGET,
      `${cfg.ios.bundleIdentifier}.${TARGET}`,
    );
    project.addBuildPhase([SWIFT], "PBXSourcesBuildPhase", "Sources", target.uuid);
    project.addBuildPhase([], "PBXResourcesBuildPhase", "Resources", target.uuid);
    project.addBuildPhase([], "PBXFrameworksBuildPhase", "Frameworks", target.uuid);

    for (const c of Object.values(project.pbxXCBuildConfigurationSection())) {
      if (c?.buildSettings?.PRODUCT_NAME !== `"${TARGET}"`) continue;
      Object.assign(c.buildSettings, {
        DEVELOPMENT_TEAM: cfg.ios.appleTeamId,
        CODE_SIGN_STYLE: "Automatic",
        IPHONEOS_DEPLOYMENT_TARGET: appDeploymentTarget,
        SWIFT_VERSION: "5.0",
        TARGETED_DEVICE_FAMILY: '"1,2"',
        GENERATE_INFOPLIST_FILE: "NO",
      });
    }
    project.addTargetAttribute("DevelopmentTeam", cfg.ios.appleTeamId, target);
    return cfg;
  });

module.exports = (config) => withTarget(withFiles(config));
