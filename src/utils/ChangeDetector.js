/**
 * ChangeDetector - Utility for detecting and computing file changes between directories
 */

const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');
const { Logger } = require('./Logger');
const { FileSystem } = require('./FileSystem');

class ChangeDetector {
  constructor(options = {}) {
    this.options = options;
    this.logger = new Logger(options);
    this.fs = new FileSystem(options);
  }

  /**
   * Compute changes between two directories
   * @param {string} baseDir - Base directory path
   * @param {string} targetDir - Target directory path
   * @param {Object} options - Options for change detection
   * @returns {Promise<Object>} - Change summary with files and metadata
   */
  async computeChanges(baseDir, targetDir, options = {}) {
    const { excludePatterns = ['.git', 'node_modules', '.DS_Store'] } = options;
    
    this.logger.debug(`Computing changes between ${baseDir} and ${targetDir}`);
    
    const baseFiles = await this.getFileTree(baseDir, excludePatterns);
    const targetFiles = await this.getFileTree(targetDir, excludePatterns);
    
    const changes = {
      added: [],
      modified: [],
      deleted: [],
      unchanged: [],
      summary: {
        filesChanged: 0,
        linesAdded: 0,
        linesDeleted: 0,
        totalFiles: 0
      }
    };
    
    // Find added and modified files
    for (const [relativePath, targetFile] of Object.entries(targetFiles)) {
      const baseFile = baseFiles[relativePath];
      
      if (!baseFile) {
        // File was added
        changes.added.push({
          path: relativePath,
          size: targetFile.size,
          hash: targetFile.hash
        });
      } else if (baseFile.hash !== targetFile.hash) {
        // File was modified
        const diffStats = await this.computeFileDiff(
          path.join(baseDir, relativePath),
          path.join(targetDir, relativePath)
        );
        
        changes.modified.push({
          path: relativePath,
          oldHash: baseFile.hash,
          newHash: targetFile.hash,
          ...diffStats
        });
      } else {
        // File unchanged
        changes.unchanged.push({
          path: relativePath,
          hash: targetFile.hash
        });
      }
    }
    
    // Find deleted files
    for (const [relativePath, baseFile] of Object.entries(baseFiles)) {
      if (!targetFiles[relativePath]) {
        changes.deleted.push({
          path: relativePath,
          hash: baseFile.hash,
          size: baseFile.size
        });
      }
    }
    
    // Compute summary statistics
    changes.summary.filesChanged = changes.added.length + changes.modified.length + changes.deleted.length;
    changes.summary.totalFiles = Object.keys(targetFiles).length;
    changes.summary.linesAdded = changes.added.reduce((sum, f) => sum + (f.lines || 0), 0) +
                                 changes.modified.reduce((sum, f) => sum + (f.linesAdded || 0), 0);
    changes.summary.linesDeleted = changes.deleted.reduce((sum, f) => sum + (f.lines || 0), 0) +
                                   changes.modified.reduce((sum, f) => sum + (f.linesDeleted || 0), 0);
    
    return changes;
  }

  /**
   * Generate a hash for a set of changes
   * @param {Object} changes - Changes object from computeChanges
   * @returns {string} - SHA-256 hash of the changes
   */
  generateChangesHash(changes) {
    // Create a deterministic representation of the changes
    const changeData = {
      added: changes.added.map(f => ({ path: f.path, hash: f.hash })).sort((a, b) => a.path.localeCompare(b.path)),
      modified: changes.modified.map(f => ({ path: f.path, oldHash: f.oldHash, newHash: f.newHash })).sort((a, b) => a.path.localeCompare(b.path)),
      deleted: changes.deleted.map(f => ({ path: f.path, hash: f.hash })).sort((a, b) => a.path.localeCompare(b.path))
    };
    
    const dataString = JSON.stringify(changeData);
    return crypto.createHash('sha256').update(dataString).digest('hex').substring(0, 8);
  }

  /**
   * Compute similarity between two change sets
   * @param {Object} changes1 - First change set
   * @param {Object} changes2 - Second change set
   * @returns {number} - Similarity percentage (0-100)
   */
  computeSimilarity(changes1, changes2) {
    const files1 = new Set([
      ...changes1.added.map(f => f.path),
      ...changes1.modified.map(f => f.path),
      ...changes1.deleted.map(f => f.path)
    ]);
    
    const files2 = new Set([
      ...changes2.added.map(f => f.path),
      ...changes2.modified.map(f => f.path),
      ...changes2.deleted.map(f => f.path)
    ]);
    
    const intersection = new Set([...files1].filter(f => files2.has(f)));
    const union = new Set([...files1, ...files2]);
    
    if (union.size === 0) return 100; // Both empty
    
    return Math.round((intersection.size / union.size) * 100);
  }

  /**
   * Get file tree with hashes for a directory
   * @param {string} dirPath - Directory path
   * @param {Array} excludePatterns - Patterns to exclude
   * @returns {Promise<Object>} - Map of relative paths to file metadata
   */
  async getFileTree(dirPath, excludePatterns = []) {
    const files = {};
    
    if (!await this.fs.exists(dirPath)) {
      return files;
    }
    
    const walkDir = async (currentPath, relativePath = '') => {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        const relPath = path.join(relativePath, entry.name);
        
        // Skip excluded patterns
        if (excludePatterns.some(pattern => relPath.includes(pattern))) {
          continue;
        }
        
        if (entry.isDirectory()) {
          await walkDir(fullPath, relPath);
        } else if (entry.isFile()) {
          const stats = await fs.stat(fullPath);
          const content = await fs.readFile(fullPath);
          const hash = crypto.createHash('sha256').update(content).digest('hex');
          
          files[relPath] = {
            size: stats.size,
            hash: hash,
            mtime: stats.mtime
          };
        }
      }
    };
    
    await walkDir(dirPath);
    return files;
  }

  /**
   * Compute diff statistics for a single file
   * @param {string} oldFilePath - Path to old file
   * @param {string} newFilePath - Path to new file
   * @returns {Promise<Object>} - Diff statistics
   */
  async computeFileDiff(oldFilePath, newFilePath) {
    try {
      const oldExists = await this.fs.exists(oldFilePath);
      const newExists = await this.fs.exists(newFilePath);
      
      if (!oldExists && !newExists) {
        return { linesAdded: 0, linesDeleted: 0, lines: 0 };
      }
      
      if (!oldExists) {
        const newContent = await fs.readFile(newFilePath, 'utf8');
        const lines = newContent.split('\n').length;
        return { linesAdded: lines, linesDeleted: 0, lines };
      }
      
      if (!newExists) {
        const oldContent = await fs.readFile(oldFilePath, 'utf8');
        const lines = oldContent.split('\n').length;
        return { linesAdded: 0, linesDeleted: lines, lines };
      }
      
      const oldContent = await fs.readFile(oldFilePath, 'utf8');
      const newContent = await fs.readFile(newFilePath, 'utf8');
      
      const oldLines = oldContent.split('\n');
      const newLines = newContent.split('\n');
      
      // Simple line-based diff (could be enhanced with proper diff algorithm)
      const linesAdded = Math.max(0, newLines.length - oldLines.length);
      const linesDeleted = Math.max(0, oldLines.length - newLines.length);
      
      return {
        linesAdded,
        linesDeleted,
        lines: newLines.length
      };
    } catch (error) {
      this.logger.warn(`Failed to compute diff for ${oldFilePath} -> ${newFilePath}: ${error.message}`);
      return { linesAdded: 0, linesDeleted: 0, lines: 0 };
    }
  }

  /**
   * Extract only changed files to a target directory
   * @param {string} sourceDir - Source directory
   * @param {string} targetDir - Target directory to store changes
   * @param {Object} changes - Changes object from computeChanges
   * @returns {Promise<void>}
   */
  async extractChanges(sourceDir, targetDir, changes) {
    this.logger.debug(`Extracting changes to ${targetDir}`);

    // Resolve absolute paths to check if they're the same
    const absSourceDir = path.resolve(sourceDir);
    const absTargetDir = path.resolve(targetDir);

    // If source and target are the same, we don't need to copy files
    const sameDirectory = absSourceDir === absTargetDir;

    // Ensure target directory exists
    await this.fs.ensureDir(targetDir);

    if (!sameDirectory) {
      // Copy added and modified files
      const filesToCopy = [...changes.added, ...changes.modified];

      for (const file of filesToCopy) {
        const sourcePath = path.join(sourceDir, file.path);
        const targetPath = path.join(targetDir, file.path);

        if (await this.fs.exists(sourcePath)) {
          await this.fs.ensureDir(path.dirname(targetPath));
          await fs.copy(sourcePath, targetPath);
        }
      }
    }

    // Create metadata file
    const metadataPath = path.join(targetDir, 'changes_metadata.json');
    await this.fs.writeJSON(metadataPath, {
      timestamp: new Date().toISOString(),
      hash: this.generateChangesHash(changes),
      summary: changes.summary,
      changes: {
        added: changes.added.length,
        modified: changes.modified.length,
        deleted: changes.deleted.length
      }
    }, { indent: 2 });
  }
}

module.exports = { ChangeDetector };
