import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveComponent } from '../src/intelligence/component-resolver.js';
import { ComponentResolutionInputSchema } from '../src/schemas/component.schema.js';
import { ZenitchServer } from '../src/server.js';
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

test('Component Intelligence: Resolves REUSE_EXISTING when primitive Button matches request', () => {
  const result = resolveComponent({
    requestedFunctionality: 'Submit action button with loading state',
    targetPageOrView: 'CheckoutPage',
    enforceReuse: true,
    existingComponentsOverride: [
      {
        name: 'Button',
        filePath: 'src/components/ui/Button.tsx',
        type: 'ui_primitive',
        exports: ['Button', 'ButtonProps'],
        responsibilities: ['Trigger action', 'Loading spinner']
      }
    ]
  });

  assert.equal(result.resolutionType, 'REUSE_EXISTING');
  assert.equal(result.recommendedComponent.name, 'Button');
  assert.equal(result.isNewComponentJustified, false);
  assert.ok(result.preventedDuplicationOf?.includes('Prevented authoring redundant new component'));
  assert.ok(result.recommendedComponent.codeSnippet.includes("import { Button } from './src/components/ui/Button'"));
  assert.ok(result.evidence.confidenceScore >= 0.5);
});

test('Component Intelligence: Resolves SCAFFOLD_NEW when functionality is genuinely novel', () => {
  const result = resolveComponent({
    requestedFunctionality: 'Metamorphic 3D particle canvas renderer',
    targetPageOrView: 'HeroSection',
    enforceReuse: true,
    frameworkHint: 'nextjs_app_router',
    existingComponentsOverride: [
      {
        name: 'Button',
        filePath: 'src/components/ui/Button.tsx',
        type: 'ui_primitive',
        exports: ['Button']
      },
      {
        name: 'Card',
        filePath: 'src/components/ui/Card.tsx',
        type: 'ui_primitive',
        exports: ['Card']
      }
    ]
  });

  assert.equal(result.resolutionType, 'SCAFFOLD_NEW');
  assert.equal(result.isNewComponentJustified, true);
  assert.ok(result.recommendedComponent.codeSnippet.includes('Metamorphic3dParticleCanvasRendererProps'));
  assert.ok(result.recommendedComponent.codeSnippet.includes("'use client'"));
});

test('Component Intelligence: Detects duplicate components in project structure', () => {
  const result = resolveComponent({
    requestedFunctionality: 'Confirmation modal dialog',
    targetPageOrView: 'SettingsView',
    existingComponentsOverride: [
      {
        name: 'Modal',
        filePath: 'src/components/ui/Modal.tsx',
        type: 'ui_primitive',
        exports: ['Modal']
      },
      {
        name: 'DialogModal',
        filePath: 'src/components/common/DialogModal.tsx',
        type: 'ui_primitive',
        exports: ['DialogModal']
      },
      {
        name: 'PrimaryButton',
        filePath: 'src/components/ui/PrimaryButton.tsx',
        type: 'ui_primitive'
      },
      {
        name: 'Button',
        filePath: 'src/components/ui/Button.tsx',
        type: 'ui_primitive'
      }
    ]
  });

  assert.ok(result.detectedDuplicates.length >= 2);
  const buttonDup = result.detectedDuplicates.find(d => d.componentA === 'PrimaryButton' && d.componentB === 'Button');
  assert.ok(buttonDup);
  assert.ok(buttonDup.recommendation.includes('Consolidate'));
});

test('Component Intelligence: Scaffolds Vue component when Vue framework is detected', () => {
  const result = resolveComponent({
    requestedFunctionality: 'Metrics comparison widget',
    targetPageOrView: 'AnalyticsDashboard',
    frameworkHint: 'vue',
    existingComponentsOverride: []
  });

  assert.equal(result.resolutionType, 'SCAFFOLD_NEW');
  assert.ok(result.recommendedComponent.codeSnippet.includes('<template>'));
  assert.ok(result.recommendedComponent.codeSnippet.includes('<script setup lang="ts">'));
});

test('Component Intelligence: Handles missing project directory gracefully without throwing', () => {
  const result = resolveComponent({
    requestedFunctionality: 'Filter chips row',
    projectRoot: 'C:/non_existent_folder_xyz_123',
    targetPageOrView: 'FeedView'
  });

  assert.ok(result);
  assert.ok(result.recommendedComponent);
  assert.equal(result.resolutionType, 'SCAFFOLD_NEW');
});

test('Component Intelligence: Rejects functionality description under 3 characters', () => {
  assert.throws(() => {
    
    ComponentResolutionInputSchema.parse({
      requestedFunctionality: 'ok',
      targetPageOrView: 'Home'
    });
  });
});

test('ZenitchServer: executes zenitch_resolve_component via CallTool', async () => {
  const server = new ZenitchServer({ requireApprovalForChanges: false, logLevel: 'ERROR' });
  const internalServer = server.getServerInstance();

  const handler = (internalServer as any)._requestHandlers.get(CallToolRequestSchema.shape.method.value);
  assert.ok(handler);

  const response = await handler(
    {
      method: 'tools/call',
      params: {
        name: 'zenitch_resolve_component',
        arguments: {
          requestedFunctionality: 'User avatar thumbnail with status badge',
          targetPageOrView: 'TopNavbar',
          enforceReuse: true,
          existingComponentsOverride: [
            {
              name: 'Avatar',
              filePath: 'src/components/ui/Avatar.tsx',
              type: 'ui_primitive',
              exports: ['Avatar']
            }
          ]
        }
      }
    },
    {}
  );

  assert.equal(response.isError, undefined);
  const parsed = JSON.parse(response.content[0].text);
  assert.equal(parsed.success, true);
  assert.equal(parsed.data.resolutionType, 'REUSE_EXISTING');
  assert.equal(parsed.data.recommendedComponent.name, 'Avatar');
  assert.equal(parsed.data.isNewComponentJustified, false);
});
