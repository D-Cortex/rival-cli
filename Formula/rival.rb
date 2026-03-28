class Rival < Formula
  desc "Rival CLI — manage and push function code to the Rival platform"
  homepage "https://rival.io"
  version "1.0.0"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/D-Cortex/rival-cli/releases/download/v#{version}/rival-macos-arm64"
      sha256 "fd1aa7be65c0c26f6e518590287365846b012b5cf5d20f78e4e2740b10873b16"
    else
      url "https://github.com/D-Cortex/rival-cli/releases/download/v#{version}/rival-macos-x64"
      sha256 "e52f9323491568fad6402595c1635758d1dc66479c9090b532c0881ca4e2b4a3"
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
