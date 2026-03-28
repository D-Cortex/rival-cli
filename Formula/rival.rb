class Rival < Formula
  desc "Rival CLI — manage and push function code to the Rival platform"
  homepage "https://rival.io"
  version "1.0.0"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/rival-io/rival-cli/releases/download/v#{version}/rival-macos-arm64"
      sha256 "REPLACE_WITH_ARM64_SHA256"
    else
      url "https://github.com/rival-io/rival-cli/releases/download/v#{version}/rival-macos-x64"
      sha256 "REPLACE_WITH_X64_SHA256"
    end
  end

  def install
    binary = Dir["rival-macos-*"].first
    bin.install binary => "rival"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/rival --version")
  end
end
